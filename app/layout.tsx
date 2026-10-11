import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Builder — генерация изображений",
  description:
    "Одностраничное приложение для генерации изображений через GigaChat API",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
