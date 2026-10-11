"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

type Status = "idle" | "loading" | "error" | "ready";

// Подсказки-примеры: клик заполняет поле и сразу запускает генерацию
const EXAMPLES = [
  "Кот в новогоднем свитере, акварель",
  "«С днём рождения», воздушные шары, флэт-вектор",
  "Ночный город в дождь, неоновые отблески",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);

  const loading = status === "loading";

  // Текст передаётся аргументом: после setPrompt новое значение стейта
  // в этой же функции недоступно (асинхронность React) — важно для чипов,
  // которые заполняют поле и генерируют одним кликом.
  async function generate(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data: { image?: string; error?: string } = await response.json();

      if (!response.ok || !data.image) {
        setError(data.error ?? "Не удалось сгенерировать изображение.");
        setStatus("error");
        return;
      }
      setImage(data.image);
      setStatus("ready");
    } catch {
      setError("Сервер недоступен. Проверьте, что приложение запущено.");
      setStatus("error");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void generate(prompt);
  }

  function handleExample(example: string) {
    setPrompt(example);
    void generate(example);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void generate(prompt);
    }
  }

  return (
    <main className="page">
      <div className="card">
        <header className="header">
          <h1>Card Builder</h1>
          <p className="subtitle">
            Опишите открытку — GigaChat нарисует её за несколько секунд
          </p>
        </header>

        <form className="form" onSubmit={handleSubmit}>
          <textarea
            className="textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Например: акварельная открытка с котом в новогоднем свитере, тёплые тона"
            rows={3}
            maxLength={1000}
            disabled={loading}
          />
          <div className="examples">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="chip"
                onClick={() => handleExample(example)}
                disabled={loading}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="form-footer">
            <span className="hint">Ctrl + Enter — сгенерировать</span>
            <button className="button" type="submit" disabled={loading || !prompt.trim()}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden />
                  Рисуем…
                </>
              ) : (
                "Сгенерировать"
              )}
            </button>
          </div>
        </form>

        {status === "error" && error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div className="result">
          {loading && (
            <div className="placeholder">
              <span className="spinner spinner--big" aria-hidden />
              <p>GigaChat рисует, это займёт до минуты…</p>
            </div>
          )}

          {!loading && status === "ready" && image && (
            <>
              {/* next/image не оптимизирует base64 data-URL — картинки уже
                  полностью получены с сервера, оптимизировать нечего */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="image" src={image} alt={prompt.trim()} />
              <a className="download" href={image} download="gigachat.jpg">
                Скачать изображение
              </a>
            </>
          )}

          {!loading && status !== "ready" && (
            <div className="placeholder placeholder--idle">
              <p>Здесь появится сгенерированная картинка</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
