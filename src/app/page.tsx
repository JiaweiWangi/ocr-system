"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import UploadPanel from "@/components/UploadPanel";
import TaskCard from "@/components/TaskCard";
import { fetchJson, type TaskSummary } from "@/lib/client/api";

export default function HomePage() {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [mock, setMock] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ tasks: TaskSummary[]; mock: boolean }>("/api/tasks");
      setTasks(data.tasks);
      setMock(data.mock);
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取列表，setState 均发生在 await 之后
    void load();
  }, [load]);

  // 有进行中任务时轮询刷新（3s）
  useEffect(() => {
    const active = tasks?.some((t) => t.status === "pending" || t.status === "processing");
    if (active && timerRef.current === null) {
      timerRef.current = setInterval(() => void load(), 3000);
    }
    if (!active && timerRef.current !== null) {
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

  const recent = tasks?.slice(0, 8) ?? null;

  return (
    <>
      <TopBar
        right={
          mock && (
            <span className="mr-1 font-mono text-[11px] tracking-wide text-ink-4">
              MOCK · 不耗额度
            </span>
          )
        }
      />

      <main className="mx-auto w-full max-w-[900px] px-6 pb-20 pt-10">
        <h1 className="text-center font-serif text-[31px] font-bold leading-[1.35] tracking-[0.03em] text-ink [text-wrap:balance]">
          纸上文字，<em className="not-italic text-red">悉数入册</em>
        </h1>
        <p className="mb-7 mt-2.5 text-center text-[14px] text-ink-3">
          拍照文档、表格截图、票据单据、试卷与扫描件——识别、校对、导出，一站完成。
        </p>

        <UploadPanel />

        <div className="mb-4 mt-9 flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-bold tracking-[0.06em] text-ink">最近任务</h2>
          {tasks && tasks.length > 8 && (
            <Link href="/history" className="text-[13px] font-semibold text-red hover:text-red-deep">
              查看全部 →
            </Link>
          )}
        </div>

        {recent === null ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[14px] bg-card shadow-card"
                aria-hidden
              >
                <div className="h-36 animate-pulse bg-paper" />
                <div className="space-y-2 p-3.5">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-paper" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-paper" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-line-strong py-14 text-center">
            <p className="font-serif text-[17px] tracking-[0.15em] text-ink-3">册页尚虚</p>
            <p className="mt-2 text-[13px] text-ink-4">上传一张图片，开始第一次识别</p>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {recent.map((t) => (
              <TaskCard key={t.id} task={t} onChanged={() => void load()} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
