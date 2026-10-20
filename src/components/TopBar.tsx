"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** 朱砂印章 logo */
export function SealMark({ char = "识" }: { char?: string }) {
  return <span className="seal-mark shrink-0">{char}</span>;
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
    <header className="sticky top-0 z-20 grid h-[60px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-line bg-paper/90 px-3 backdrop-blur-md sm:px-5">
      <Link
        href="/"
        aria-label="识 · 多版式 OCR 文档识别系统"
        title="识 · 多版式 OCR 文档识别系统"
        className="flex min-w-0 max-w-full items-center gap-2.5 justify-self-start"
      >
        <SealMark />
        {!compact && (
          <span className="hidden min-w-0 truncate font-serif text-[16px] font-bold tracking-normal text-ink md:block">
            识 · 多版式 OCR 文档识别系统
          </span>
        )}
      </Link>

      <nav
        aria-label="主导航"
        className="mx-auto flex gap-1.5 whitespace-nowrap rounded-full border border-line bg-card p-1 shadow-card"
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

      <div className="flex min-w-0 items-center justify-end gap-2 [&>*]:min-w-0 [&>*]:truncate">
        {right}
      </div>
    </header>
  );
}
