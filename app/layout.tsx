import type { Metadata } from "next";
import "./globals.css";
import "./ui.css";

export const metadata: Metadata = {
  title: "こもれび — 家族で共有する育児記録",
  description: "授乳、おしっこ、うんち。赤ちゃんの毎日の記録を家族で共有。日本語・中文対応。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
