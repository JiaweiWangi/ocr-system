"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  fetchJson,
  formatTime,
  MODE_LABEL,
  PRECISION_LABEL,
  statusLabel,
  type TaskSummary,
} from "@/lib/client/api";

const STATUS_PILL: Record<TaskSummary["status"], string> = {
  pending: "bg-gold-wash text-gold",
  processing: "bg-gold-wash text-gold",
  success: "bg-moss-wash text-moss",
  failed: "bg-red-wash text-red-deep",
};

/**
 * 任务封面卡片：图片封面 + 状态 pill + 悬停浮起与操作
 */
export default function TaskCard({
  task,
  onChanged,
}: {
  task: TaskSummary;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"delete" | "retry" | null>(null);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!window.confirm(`确定删除「${task.title}」？识别结果与编辑历史将一并清除。`)) return;
    setBusy("delete");
    try {
      await fetchJson(`/api/tasks/${task.id}`, { method: "DELETE" });
      onChanged();
    } catch {
      window.alert("删除失败，请重试");
      setBusy(null);
    }
  }

  async function onRetry(e: React.MouseEvent) {
    e.preventDefault();
    setBusy("retry");
    try {
      await fetchJson(`/api/tasks/${task.id}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      onChanged();
    } catch {
      window.alert("重试失败，请稍后再试");
      setBusy(null);
    }
  }

  const active = task.status === "pending" || task.status === "processing";

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group relative block overflow-hidden rounded-[14px] bg-card shadow-card transition-all duration-150 ease-out hover:-translate-y-[3px] hover:shadow-lift focus-visible:outline-2 focus-visible:outline-red/40"
    >
      {/* 封面 */}
      <div className="relative h-36 overflow-hidden border-b border-line bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element -- 本地 API 服务原图，无 next/image 优化收益 */}
        <img
          src={`/api/tasks/${task.id}/image`}
          alt={`${task.title} 原图`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
        {active && (
          <div className="absolute inset-0 grid place-items-center bg-paper/70 backdrop-blur-[1px]">
            <Loader2 className="size-7 animate-spin text-gold" strokeWidth={1.8} />
          </div>
        )}
        {task.status === "failed" && (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#fdf6f5]/85 to-[#f7ebea]/85">
            <p className="max-w-[85%] truncate text-[11.5px] font-medium text-red-deep">
              ✕ {task.error || "识别失败"}
            </p>
          </div>
        )}
        <span
          className={`pill absolute left-2.5 top-2.5 ${STATUS_PILL[task.status]}`}
        >
          {active && <Loader2 className="size-[11px] animate-spin" />}
          {statusLabel(task.status, task.mode)}
        </span>
        <div className="absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {task.status === "failed" && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy !== null}
              className="rounded-lg border border-line bg-card/95 px-2.5 py-1 text-xs font-semibold text-ink-2 shadow-card backdrop-blur-sm hover:text-red"
            >
              {busy === "retry" ? "…" : "重试"}
            </button>
          )}
          <button
            type="button"
            aria-label="删除任务"
            onClick={onDelete}
            disabled={busy !== null}
            className="grid size-7 place-items-center rounded-lg bg-card/95 text-ink-2 shadow-card backdrop-blur-sm hover:text-red disabled:opacity-50"
          >
            {busy === "delete" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 题名与 meta */}
      <div className="px-3.5 py-3">
        <h3 className="truncate font-serif text-[14.5px] font-bold tracking-[0.02em] text-ink">
          {task.title}
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
          <span>
            {MODE_LABEL[task.mode]}
            {task.mode === "general" ? ` · ${PRECISION_LABEL[task.precision ?? "standard"]}` : ""}
          </span>
          <span className="text-ink-4">·</span>
          <span>{formatTime(task.createdAt)}</span>
        </p>
      </div>
    </Link>
  );
}
