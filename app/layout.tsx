import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#41664f",
};

export const metadata: Metadata = {
  title: "こもれび — 家族で共有する育児記録",
  description: "授乳、おむつ、睡眠、体重。赤ちゃんの毎日の記録を家族で共有。日本語・中文対応。",
  applicationName: "こもれび",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "こもれび", statusBarStyle: "default" },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
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
