import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shibuya Scene Reconstruction — S16.3",
  description: "Shibuya rounded crowds, shared PBR materials and tiered render fidelity.",
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
