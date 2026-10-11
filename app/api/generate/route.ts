import { NextResponse } from "next/server";
import https from "node:https";
import GigaChat, { detectImage } from "gigachat";
import { GigaChatException } from "gigachat/exceptions";

const MAX_PROMPT_LENGTH = 1000;
const GIGACHAT_TIMEOUT_SECONDS = 90;

// Генерация картинок стабильно работает на Pro/Max; дефолтная GigaChat (лайт)
// может ответить без изображения. Меняется через GIGACHAT_MODEL в .env.local.
const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL ?? "GigaChat-Pro";

/**
 * Endpoints GigaChat используют корневой сертификат Минцифры, которого нет
 * в хранилище Node по умолчанию. Правильное решение — NODE_EXTRA_CA_CERTS
 * (см. README). GIGACHAT_INSECURE_TLS=true отключает проверку целиком,
 * допустимо только в песочнице.
 */
const httpsAgent =
  process.env.GIGACHAT_INSECURE_TLS === "true"
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

let cachedClient: GigaChat | null = null;

function getClient(): GigaChat {
  if (cachedClient) return cachedClient;
  const credentials =
    process.env.GIGACHAT_AUTH_KEY ?? process.env.GIGACHAT_CREDENTIALS;
  // Пустой ключ или нетронутый плейсхолдер из .env.local считаем ненастроенными
  if (!credentials || credentials.startsWith("<")) {
    throw new Error("ENV_NOT_CONFIGURED: GIGACHAT_AUTH_KEY не задан");
  }
  cachedClient = new GigaChat({
    credentials,
    scope: process.env.GIGACHAT_SCOPE ?? "GIGACHAT_API_PERS",
    model: GIGACHAT_MODEL,
    timeout: GIGACHAT_TIMEOUT_SECONDS,
    httpsAgent,
  });
  return cachedClient;
}

function extractImageId(content: string): string | null {
  // Сначала хелпер SDK (шаблон <img src="..." fuse="true"/>),
  // затем более свободная регулярка — формат ответа может меняться.
  const detected = detectImage(content);
  if (detected?.uuid) return detected.uuid;
  const match = content.match(/<img[^>]*\ssrc="([^"]+)"/i);
  return match ? (match[1] ?? null) : null;
}

// getImage() запрашивает контент с responseEncoding: "binary", поэтому
// строку нужно декодировать как latin1; на всякий случай поддерживаем
// и бинарные типы.
function toBase64(content: unknown): string {
  if (Buffer.isBuffer(content)) return content.toString("base64");
  if (typeof content === "string") {
    return Buffer.from(content, "binary").toString("base64");
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content).toString("base64");
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(content)).toString("base64");
  }
  throw new Error("GigaChat вернул файл в неожиданном формате");
}

function upstreamMessage(error: GigaChatException): string | undefined {
  const data: unknown = error.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

function errorResponse(error: unknown): NextResponse {
  console.error("[/api/generate]", error);

  if (error instanceof GigaChatException) {
    const status = error.response?.status;
    const detail = upstreamMessage(error);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error:
            "GigaChat отклонил авторизацию. Проверьте GIGACHAT_AUTH_KEY и GIGACHAT_SCOPE в .env.local.",
        },
        { status: 502 },
      );
    }
    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "Превышен лимит запросов к GigaChat. Подождите немного и попробуйте снова.",
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: detail
          ? `GigaChat вернул ошибку: ${detail}`
          : "GigaChat вернул ошибку. Попробуйте ещё раз.",
      },
      { status: 502 },
    );
  }

  const code = (error as { code?: string }).code ?? "";
  const message = error instanceof Error ? error.message : String(error);

  if (code === "ECONNABORTED" || /timeout/i.test(message)) {
    return NextResponse.json(
      { error: "GigaChat не ответил вовремя. Попробуйте ещё раз." },
      { status: 504 },
    );
  }
  if (/CERT/i.test(code) || /certificate/i.test(message)) {
    return NextResponse.json(
      {
        error:
          "Не удалось проверить TLS-сертификат GigaChat. Настройте NODE_EXTRA_CA_CERTS (см. README) или задайте GIGACHAT_INSECURE_TLS=true — только для песочницы.",
      },
      { status: 502 },
    );
  }
  if (message.includes("ENV_NOT_CONFIGURED")) {
    return NextResponse.json(
      {
        error:
          "Ключ GigaChat не настроен. Заполните GIGACHAT_AUTH_KEY в .env.local (см. README).",
      },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { error: "Не удалось сгенерировать изображение. Попробуйте ещё раз." },
    { status: 500 },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawPrompt: unknown;
  try {
    const body: unknown = await request.json();
    rawPrompt = (body as { prompt?: unknown } | null)?.prompt;
  } catch {
    return NextResponse.json(
      { error: "Некорректный JSON в теле запроса." },
      { status: 400 },
    );
  }

  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";

  if (prompt.length === 0) {
    return NextResponse.json(
      { error: "Опишите, что нужно нарисовать." },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      {
        error: `Описание слишком длинное: максимум ${MAX_PROMPT_LENGTH} символов.`,
      },
      { status: 400 },
    );
  }

  try {
    const client = getClient();

    // text2image — встроенная функция: отдельного endpoint'а генерации нет.
    // Достаточно одного запроса с function_call: "auto" — ответ с
    // finish_reason: "stop" содержит <img src="<fileId>"> в message.content
    // (см. developers.sber.ru/docs/ru/gigachat/guides/images-generation).
    const completion = await client.chat({
      messages: [{ role: "user", content: prompt }],
      function_call: "auto",
    });

    const choice = completion.choices?.[0];
    const content = choice?.message?.content;

    if (typeof content !== "string" || content.length === 0) {
      return NextResponse.json(
        {
          error: `Модель ${GIGACHAT_MODEL} не вернула ответ (finish_reason: ${choice?.finish_reason ?? "неизвестен"}). Попробуйте ещё раз или смените модель через GIGACHAT_MODEL в .env.local.`,
        },
        { status: 502 },
      );
    }

    const fileId = extractImageId(content);
    if (!fileId) {
      // Картинки нет — модель ответила текстом (отказ, уточнение и т.п.),
      // покажем этот текст пользователю.
      return NextResponse.json(
        { error: `Модель не сгенерировала изображение: ${content.trim()}` },
        { status: 502 },
      );
    }

    const file = await client.getImage(fileId);
    const dataUrl = `data:image/jpeg;base64,${toBase64(file.content)}`;
    return NextResponse.json({ image: dataUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
