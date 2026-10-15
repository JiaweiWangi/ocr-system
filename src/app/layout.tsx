import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "识 · 多版式 OCR 文档识别系统",
  description: "纸上文字，悉数入册——多版式 OCR 文档识别与在线处理系统",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
