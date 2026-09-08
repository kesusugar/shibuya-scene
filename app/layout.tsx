import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shibuya Scene Reconstruction — S1",
  description: "Shibuya OSM data and geographic utility inspection.",
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
