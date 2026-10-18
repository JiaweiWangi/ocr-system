"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** 朱砂印章 logo */
export function SealMark({ char = "识" }: { char?: string }) {
  return <span className="seal-mark">{char}</span>;
}

/**
 * 顶栏：品牌 + 居中胶囊导航 + 右侧操作区
 */
export default function TopBar({
  right,
  compact = false,
}: {
  right?: ReactNode;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isHistory = pathname.startsWith("/history") || pathname.startsWith("/tasks");

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center border-b border-line bg-paper/90 px-5 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5">
        <SealMark />
        {!compact && (
          <span className="font-serif text-[16px] font-bold tracking-[0.08em] text-ink">
            识 · 多版式 OCR 文档识别系统
          </span>
        )}
      </Link>

      <nav
        aria-label="主导航"
        className="mx-auto flex gap-1.5 rounded-full border border-line bg-card p-1 shadow-card"
      >
        <Link
          href="/"
          aria-current={isHome ? "page" : undefined}
          className={`rounded-full px-5 py-1.5 text-[13.5px] font-semibold transition-all duration-150 ease-out ${
            isHome
              ? "bg-red text-white shadow-[0_2px_8px_rgba(224,53,48,0.35)]"
              : "text-ink-2 hover:bg-paper"
          }`}
        >
          识别
        </Link>
        <Link
          href="/history"
          aria-current={isHistory ? "page" : undefined}
          className={`rounded-full px-5 py-1.5 text-[13.5px] font-semibold transition-all duration-150 ease-out ${
            isHistory
              ? "bg-red text-white shadow-[0_2px_8px_rgba(224,53,48,0.35)]"
              : "text-ink-2 hover:bg-paper"
          }`}
        >
          历史
        </Link>
      </nav>

      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
