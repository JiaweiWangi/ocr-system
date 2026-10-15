"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw, ScanText } from "lucide-react";
import { fetchJson, MODE_LABEL, type TaskMode } from "@/lib/client/api";

/**
 * 进行中状态面板：轮询 /status（深度模式在此推进百度侧任务）。
 */
export function ProcessingPanel({
  taskId,
  mode,
  onDone,
}: {
  taskId: string;
  mode: TaskMode;
  onDone: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const poll = setInterval(async () => {
      try {
        const status = await fetchJson<{ status: string }>(`/api/tasks/${taskId}/status`);
        if (status.status === "success" || status.status === "failed") onDone();
      } catch {
        /* 轮询失败下次重试 */
      }
    }, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [taskId, onDone]);

  return (
    <main className="grid flex-1 place-items-center px-6">
      <div className="w-full max-w-sm rounded-[14px] bg-card p-8 text-center shadow-card">
        <span className="seal-mark mx-auto" style={{ width: 44, height: 44, fontSize: 24 }}>
          识
        </span>
        <h1 className="mt-4 font-serif text-lg font-bold tracking-[0.05em] text-ink">
          {mode === "deep" ? "正在解析版面" : "正在识别文字"}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {MODE_LABEL[mode]} · 已进行 {elapsed} 秒
          {mode === "deep" && " · 文档解析约需 30–60 秒，可稍候"}
        </p>
        <Loader2 className="mx-auto mt-5 size-6 animate-spin text-gold" strokeWidth={1.6} />
      </div>
    </main>
  );
}

/**
 * 失败状态面板：错误信息 + 重试。
 */
export function FailedPanel({
  taskId,
  title,
  error,
  mode,
  onRetry,
}: {
  taskId: string;
  title: string;
  error: string | null;
  mode: TaskMode;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await fetchJson(`/api/tasks/${taskId}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      onRetry();
    } catch {
      window.alert("重试失败，请稍后再试");
      setRetrying(false);
    }
  }

  return (
    <main className="grid flex-1 place-items-center px-6">
      <div className="w-full max-w-md rounded-[14px] bg-card p-8 shadow-card">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-red-wash text-red">
            <ScanText className="size-5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-lg font-bold tracking-[0.03em] text-ink">
              识别失败
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-ink-3">
              {title} · {MODE_LABEL[mode]}
            </p>
          </div>
        </div>
        <p className="mt-4 rounded-[10px] bg-red-wash px-4 py-3 text-[13px] leading-relaxed text-red-deep">
          {error || "未知错误"}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retry()}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-red px-5 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(224,53,48,0.3)] transition-all hover:bg-red-deep hover:shadow-[0_4px_14px_rgba(224,53,48,0.4)] disabled:opacity-60"
          >
            {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {retrying ? "正在重试…" : "重试"}
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> 返回上传
          </Link>
        </div>
      </div>
    </main>
  );
}

/** 成功但无内容（如版本数据异常） */
export function EmptyContentPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid flex-1 place-items-center px-6">
      <div className="w-full max-w-sm rounded-[14px] bg-card p-8 text-center shadow-card">
        <p className="font-serif text-[17px] font-bold tracking-[0.1em] text-ink">结果为空</p>
        <p className="mt-2 text-[13px] text-ink-3">识别完成但未生成文档内容，可尝试重新识别。</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-card px-5 text-[13.5px] font-semibold text-ink shadow-card hover:border-ink-4"
        >
          <RotateCcw className="size-4" /> 重新识别
        </button>
      </div>
    </main>
  );
}
