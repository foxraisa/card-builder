# Card Builder

Учебный проект: веб-приложение генерации изображений по текстовому промпту через
**GigaChat API (Сбер)**. Пользователь описывает открытку — GigaChat рисует её,
изображение можно скачать.

```
Браузер → POST /api/generate { prompt }
        → API Route: GigaChat SDK → токен → генерация → скачивание файла
        ← { image: <base64 data-url> }
Браузер: спиннер, затем <img>
```

**Стек:** Next.js 16 (App Router), TypeScript, React 19, SDK `gigachat`.
Секреты только на сервере: ключ GigaChat читается API-роутом из `.env.local`
и не попадает в клиентский бандл и git.

> Проект разработан в связке **Claude Code (CLI-агент) + модель GLM (Z.AI)** в рамках ДЗ
> «Сравнительный анализ и настройка AI-инструментов». Итоговый отчёт —
> [REPORT.md](REPORT.md), документы по шагам — в [docs/](docs/).

## Быстрый старт

```bash
npm install
```

Создайте `.env.local` в корне проекта:

```bash
# Authorization Key из кабинета developers.sber.ru
GIGACHAT_AUTH_KEY=<ваш ключ>
GIGACHAT_SCOPE=GIGACHAT_API_PERS

# Генерация картинок стабильно работает на Pro/Max
GIGACHAT_MODEL=GigaChat-Pro

# TLS: endpoints GigaChat используют корневой сертификат Минцифры,
# которого нет в хранилище Node по умолчанию. Правильное решение —
# NODE_EXTRA_CA_CERTS (путь к pem-файлу Минцифры). Переменная ниже
# отключает проверку целиком — допустимо только в песочнице.
GIGACHAT_INSECURE_TLS=true
```

```bash
npm run dev
```

Откройте http://localhost:3000.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production-сборка |
| `npm run start` | Запуск production-сборки |
| `npm run lint` | ESLint |

## Структура

```
app/
  page.tsx              # Страница: форма, подсказки-примеры, результат
  globals.css           # Стили (тёмная тема, CSS-переменные)
  api/generate/route.ts # API-роут: GigaChat → text2image → скачивание → base64
docs/                   # Документы ДЗ (шаги 1–5)
next_plan.md            # Файл-план: решения, утверждённые до кода
REPORT.md               # Итоговый отчёт ДЗ
```
