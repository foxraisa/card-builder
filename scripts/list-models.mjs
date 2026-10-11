// Разовый скрипт: печатает список моделей, доступных ключу из .env.local
// Ключ не выводится; TLS-проверка отключается тем же флагом, что и в приложении.
import https from "node:https";
import GigaChat from "gigachat";

const client = new GigaChat({
  credentials: process.env.GIGACHAT_AUTH_KEY,
  scope: process.env.GIGACHAT_SCOPE ?? "GIGACHAT_API_PERS",
  timeout: 30,
  httpsAgent:
    process.env.GIGACHAT_INSECURE_TLS === "true"
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
});

const models = await client.getModels();
for (const m of models.data) {
  console.log(m.id);
}
