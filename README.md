# Card Builder

Одностраничное приложение для генерации изображений через **GigaChat API (Сбер)**:
пользователь вводит промпт, сервер обращается к GigaChat и показывает картинку.

## Как это работает

```
Браузер → POST /api/generate { prompt }
        → API Route: SDK gigachat → OAuth-токен → chat/completions с function_call: "auto"
          → из ответа берётся ID файла (тег <img src="…">) → скачивание файла
        ← { image: "data:image/jpeg;base64,..." }
Браузер: спиннер → <img>
```

Отдельного endpoint'а text2image у GigaChat нет: это встроенная функция модели.
Запрос `POST /api/v1/chat/completions` с параметром `function_call: "auto"`
возвращает ответ, в `message.content` которого лежит `<img src="<uuid>" …>`,
где `uuid` — ID файла. Файл скачивается через
`GET /api/v1/files/{uuid}/content` и кодируется в base64 уже на сервере.
(Старый двухшаговый протокол — массив `functions` + ответ `role: "function"` —
больше не нужен; см. [руководство](https://developers.sber.ru/docs/ru/gigachat/guides/images-generation).)

Ключ GigaChat используется только в API Route (`app/api/generate/route.ts`)
и никогда не попадает в браузер.

## Получение ключа

1. Зарегистрируйтесь на [developers.sber.ru](https://developers.sber.ru) и создайте
   проект с GigaChat API (тариф для физлиц — Free).
2. В кабинете проекта нажмите **«Сгенерировать новый Client Secret»** —
   скопированная строка и есть **Authorization Key**.
3. Scope для физлица — `GIGACHAT_API_PERS`.

## Настройка

Создайте файл `.env.local` в корне проекта (он исключён из git):

```
GIGACHAT_AUTH_KEY=<ваш Authorization Key>
GIGACHAT_SCOPE=GIGACHAT_API_PERS

# Необязательно: модель генерации. По умолчанию GigaChat-Pro — картинки
# стабильно работают на Pro/Max, а дефолтная GigaChat (лайт) может
# отвечать текстом без изображения.
# GIGACHAT_MODEL=GigaChat-Pro
```

### TLS (важно на Windows)

Endpoints Гиги подписаны российским корневым сертификатом (Russian Trusted Root CA),
которого нет в хранилище Node. Без настройки возможны ошибки
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN`. Варианты решения:

- **Правильный**: в репозитории уже лежит бандл `certs/russian-trusted-ca.pem`
  (корневой и промежуточный сертификаты Минцифры с
  [gu-st.ru](https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt)).
  Запускайте dev-сервер с переменной окружения:
  ```powershell
  $env:NODE_EXTRA_CA_CERTS = "$PWD\certs\russian-trusted-ca.pem"; npm run dev
  ```
- **Только для песочницы**: раскомментировать `GIGACHAT_INSECURE_TLS=true`
  в `.env.local` — это полностью отключает проверку сертификатов.

## Запуск

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000), введите промпт,
нажмите «Сгенерировать» (или Ctrl+Enter). Генерация занимает несколько секунд.

Посмотреть список моделей, доступных вашему ключу:

```powershell
node --env-file=.env.local scripts/list-models.mjs
```

Продакшен-сборка: `npm run build && npm start`.

## Ограничения

- Бесплатный перс-тариф имеет лимиты запросов (RPM/RPD) — при превышении
  приложение покажет ошибку 429, просто подождите.
- Генерация может занимать до минуты; таймаут сервера — 90 секунд.
- Ответ модели парсится регуляркой — если формат изменится, изображение
  не найдётся и текст ответа модели будет показан как ошибка.
