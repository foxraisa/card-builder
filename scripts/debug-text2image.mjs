// Разовый скрипт: эксперименты с text2image-флоу. Ключ не выводится.
// Использование: node scripts/debug-text2image.mjs <вариант> [промпт]
// Варианты: plain (результат функции простым текстом), forced (function_call
// форсирован), 2pro / max / 2max (другая модель).
import https from "node:https";
import GigaChat from "gigachat";

const variant = process.argv[2] ?? "plain";
const prompt =
  process.argv[3] ?? "акварельная открытка с котом в свитере";

const modelMap = {
  "2pro": "GigaChat-2-Pro",
  max: "GigaChat-Max",
  "2max": "GigaChat-2-Max",
};

const client = new GigaChat({
  credentials: process.env.GIGACHAT_AUTH_KEY,
  scope: process.env.GIGACHAT_SCOPE ?? "GIGACHAT_API_PERS",
  model: modelMap[variant] ?? "GigaChat-Pro",
  timeout: 90,
  httpsAgent:
    process.env.GIGACHAT_INSECURE_TLS === "true"
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
});

const fn = {
  name: "text2image",
  description: "Генерация изображения по текстовому описанию",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Текстовое описание изображения" },
      weight: { type: "number" },
    },
    required: ["prompt"],
  },
};

const request = { functions: [fn] };
if (variant === "forced") {
  request.function_call = { name: "text2image" };
}

const first = await client.chat({
  ...request,
  messages: [{ role: "user", content: prompt }],
});
console.log("--- STEP 1 finish_reason:", first.choices?.[0]?.finish_reason);
console.log(JSON.stringify(first.choices?.[0]?.message));

const fc = first.choices?.[0]?.message?.function_call;
if (fc?.name === "text2image") {
  const second = await client.chat({
    ...request,
    messages: [
      { role: "user", content: prompt },
      first.choices[0].message,
      {
        role: "function",
        name: "text2image",
        // JSON-формат результата функция принимает; простой текст даёт 422
        content: JSON.stringify({ content: "изображение успешно сгенерировано" }),
      },
    ],
  });
  console.log("--- STEP 2 finish_reason:", second.choices?.[0]?.finish_reason);
  console.log(JSON.stringify(second.choices?.[0]?.message));
}
