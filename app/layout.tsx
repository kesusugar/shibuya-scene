import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shibuya Scene Reconstruction — S6",
  description: "Shibuya station detail, rotary and under-viaduct storefront inspection.",
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
