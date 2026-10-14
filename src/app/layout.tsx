import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "多版式 OCR 文档识别与在线处理系统",
  description:
    "面向拍照文档、表格截图、票据单据、试卷图片、宣传海报、扫描件的在线 OCR 处理系统",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
