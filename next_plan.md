# Задача: веб-приложение для генерации изображений через GigaChat API

> Файл-план для новой сессии. Скопировать в корень нового проекта и попросить:
> «Реализуй по плану из next_plan.md».

## Что делаем

Одностраничное приложение: пользователь вводит промпт, приложение обращается к
**GigaChat API (Сбер)** и показывает сгенерированное изображение.

## Принятые решения (обсуждены и утверждены)

- **Фреймворк: Next.js** (App Router, TypeScript) — выбран вместо React+Express
  ради встроенных API Routes: один проект, один dev-сервер.
- Рендеринг — SSR (по умолчанию в Next.js); для этой задачи он не критичен,
  но пусть будет.
- Секреты только на сервере: ключ GigaChat живёт в API Route и не попадает
  в клиентский бандл.

## Архитектура

```
Браузер → POST /api/generate { prompt }
        → API Route: GigaChat SDK → токен → генерация → скачивание файла
        ← { image: <base64 data-url> }
Браузер: спиннер, затем <img>
```

## Как работает генерация изображений в GigaChat

Отдельного endpoint'а text2image нет — генерация идёт через стандартный
`POST /api/v1/chat/completions` с объявленной функцией `text2image`:

1. **Токен**: OAuth по Authorization Key (из кабинета developers.sber.ru),
   scope `GIGACHAT_API_PERS` (физлицо), хост `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`.
   Официальный npm-SDK **`gigachat`** получает и обновляет токен сам —
   достаточно передать `credentials` и `scope`.
2. **Генерация**: `chat/completions`, в `functions` передаётся определение:

   ```json
   {
     "name": "text2image",
     "description": "Генерация изображения по текстовому описанию",
     "parameters": {
       "type": "object",
       "properties": {
         "prompt": { "type": "string", "description": "Текстовое описание изображения" },
         "weight": { "type": "number" }
       },
       "required": ["prompt"]
     }
   }
   ```

   В ответе `choices[0].message.content` приходит строка вида
   `<img src="<uuid>" width="..." height="...">`, где `uuid` — ID файла, НЕ готовый URL.
3. **Скачивание**: `GET https://gigachat.devices.sberbank.ru/api/v1/files/{uuid}/content`
   с Bearer-токеном → бинарный JPEG. Сервер кодирует в base64 и отдаёт клиенту
   как data-URL.

⚠️ Детали API могли измениться — перед реализацией свериться с документацией
(developers.sber.ru/giga/docs) и README пакета `gigachat`; возможно, в SDK уже
есть хелперы для картинок.

## Шаги реализации

1. **Каркас**: `npx create-next-app@latest .` — TypeScript, App Router, ESLint,
   Tailwind (по желанию; можно и без него, руками пару стилей).
2. **Зависимости**: `npm install gigachat`.
3. **Env**: файл `.env.local` (в `.gitignore` по умолчанию):
   ```
   GIGACHAT_AUTH_KEY=<Authorization Key из кабинета>
   GIGACHAT_SCOPE=GIGACHAT_API_PERS
   ```
   Реальный ключ пользователю вписать самому; в репозиторий не коммитить.
4. **API Route** `app/api/generate/route.ts`:
   - POST, валидация `{ prompt: string }` (непустой, разумная длина);
   - клиент `new GigaChat({ credentials, scope })`;
   - вызов `chat/completions` c функцией `text2image`;
   - парсинг UUID регуляркой из `message.content`;
   - скачивание файла (SDK или fetch с Bearer-токеном от SDK);
   - ответ `{ image: "data:image/jpeg;base64,..." }`;
   - ошибки наружу: аккуратный JSON `{ error: string }` с корректными HTTP-кодами;
   - таймаут/обработка долгого ответа (генерация занимает несколько секунд).
5. **Страница** `app/page.tsx`:
   - textarea для промпта + кнопка «Сгенерировать»;
   - состояние: idle / loading (спиннер, кнопка disabled) / error / ready;
   - при успехе — `<img src={dataUrl}>`; при ошибке — понятное сообщение;
   - клиентский `fetch('/api/generate', { method: 'POST', body: JSON.stringify(...) })`.
6. **README.md**: как получить Authorization Key, как заполнить `.env.local`,
   как запустить (`npm run dev`).

## Известные грабли

- **TLS**: endpoints Гиги используют российский корневой сертификат
  (Russian Trusted Root CA), которого нет в хранилище Node/Windows по умолчанию →
  возможны ошибки `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Лечение: добавить
  сертификат Минцифры и указать `NODE_EXTRA_CA_CERTS=<путь к pem>`;
  у SDK есть опция отключения проверки TLS — для песочницы допустимо,
  для прода нет.
- Бесплатный перс-тариф имеет лимиты запросов (RPM/RPD) — обрабатывать 429.
- Формат ответа строковый — парсить регуляркой аккуратно, не assuming точный шаблон.
- Windows 11 / Git Bash: команды npm работают штатно, но `MSYS_NO_PATHCONV=1`
  нужен, если в командах появятся аргументы вида `/c`.

## Критерии готовности

- `npm run dev` поднимает приложение;
- ввод промпта → через несколько секунд показывается сгенерированная картинка;
- пустой промпт и ошибка API показывают сообщение, а не падают;
- ключ не светится в сетевом трафике браузера (только внутри API Route).
