"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { fetchJson, MODE_LABEL, statusLabel, type TaskSummary } from "@/lib/client/api";

type ModeFilter = "all" | "general" | "table" | "deep";
type StatusFilter = "all" | "active" | "success" | "failed";

const MODE_FILTERS: { key: ModeFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "general", label: "通用文字" },
  { key: "table", label: "表格识别" },
  { key: "deep", label: "深度解析" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "success", label: "已完成" },
  { key: "failed", label: "失败" },
];

export default function HistoryPage() {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ tasks: TaskSummary[] }>("/api/tasks");
      setTasks(data.tasks);
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取列表，setState 均发生在 await 之后
    void load();
  }, [load]);

  useEffect(() => {
    const anyActive = tasks?.some((t) => t.status === "pending" || t.status === "processing");
    if (anyActive && timerRef.current === null) {
      timerRef.current = setInterval(() => void load(), 3000);
    }
    if (!anyActive && timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tasks, load]);

  const filtered = (tasks ?? []).filter((t) => {
    if (mode !== "all" && t.mode !== mode) return false;
    if (status === "active" && t.status !== "pending" && t.status !== "processing") return false;
    if (status === "success" && t.status !== "success") return false;
    if (status === "failed" && t.status !== "failed") return false;
    return true;
  });

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[860px] px-6 pb-20 pt-9">
        <h1 className="font-serif text-[26px] font-bold tracking-[0.05em] text-ink">历史任务</h1>

        {/* 筛选 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {MODE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={mode === f.key}
              onClick={() => setMode(f.key)}
              className={`h-8 rounded-full border px-4 text-[13px] font-semibold transition-all duration-150 ease-out ${
                mode === f.key
                  ? "border-red bg-red-wash text-red-deep"
                  : "border-line bg-card text-ink-2 hover:border-line-strong"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={status === f.key}
              onClick={() => setStatus(f.key)}
              className={`h-8 rounded-full border px-4 text-[13px] font-semibold transition-all duration-150 ease-out ${
                status === f.key
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink-2 hover:border-line-strong"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 册页式行列表 */}
        <div className="mt-6 flex flex-col gap-2.5">
          {tasks === null
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-[14px] bg-card shadow-card"
                  aria-hidden
                />
              ))
            : filtered.length === 0
              ? (
                <div className="rounded-[14px] border border-dashed border-line-strong py-14 text-center">
                  <p className="font-serif text-[17px] tracking-[0.15em] text-ink-3">
                    {tasks.length === 0 ? "册页尚虚" : "无匹配任务"}
                  </p>
                  {tasks.length === 0 && (
                    <Link
                      href="/"
                      className="mt-2 inline-block text-[13px] font-semibold text-red hover:text-red-deep"
                    >
                      去上传第一张图片 →
                    </Link>
                  )}
                </div>
              )
              : filtered.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      </main>
    </>
  );
}

function TaskRow({ task }: { task: TaskSummary }) {
  const active = task.status === "pending" || task.status === "processing";
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 rounded-[14px] border border-line bg-card px-4 py-3 shadow-card transition-all duration-150 ease-out hover:-translate-y-[2px] hover:border-red/40 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-red/40"
    >
      <div className="h-[48px] w-[64px] overflow-hidden rounded-[7px] border border-line bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element -- 缩略图走本地 API */}
        <img
          src={`/api/tasks/${task.id}/image`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate font-serif text-[15px] font-bold tracking-[0.02em] text-ink">
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
          <span>{MODE_LABEL[task.mode]}</span>
          <span className="text-ink-4">·</span>
          <span>{new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
          {task.error && (
            <span className="truncate text-red-deep">· {task.error}</span>
          )}
        </p>
      </div>
      <span
        className={`pill ${
          active
            ? "bg-gold-wash text-gold"
            : task.status === "success"
              ? "bg-moss-wash text-moss"
              : "bg-red-wash text-red-deep"
        }`}
      >
        {statusLabel(task.status, task.mode)}
      </span>
    </Link>
  );
}
