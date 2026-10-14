"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  taskId: string;
  title: string;
  status: string;
  mode: string;
  error: string | null;
}

const MODE_DESC: Record<string, string> = {
  general: "通用文字识别",
  table: "表格识别 V2（还原表格结构）",
  deep: "文档解析（版面分析，需要较长时间）",
};

export function TaskStatusPanel({ taskId, title, status, mode, error }: Props) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentError, setCurrentError] = useState(error);

  useEffect(() => {
    if (currentStatus === "success" || currentStatus === "failed") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/status`);
        const data = (await res.json()) as { status: string; error: string | null };
        setCurrentStatus(data.status);
        setCurrentError(data.error);
        if (data.status === "success") router.refresh();
      } catch {
        // 网络抖动，下次轮询继续
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [taskId, currentStatus, router]);

  async function retry(newMode?: string) {
    await fetch(`/api/tasks/${taskId}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMode ? { mode: newMode } : {}),
    });
    setCurrentStatus("pending");
    setCurrentError(null);
    if (newMode) router.refresh();
  }

  return (
    <div className="rounded-xl border p-8 text-center">
      <h1 className="truncate text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{MODE_DESC[mode] ?? mode}</p>

      {(currentStatus === "pending" || currentStatus === "processing") && (
        <div className="mt-8 space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">
            {mode === "deep" ? "文档解析处理中，通常需要 10–60 秒…" : "正在识别…"}
          </p>
        </div>
      )}

      {currentStatus === "failed" && (
        <div className="mt-8 space-y-4">
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {currentError ?? "识别失败"}
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={() => retry()}>重试</Button>
            {mode !== "general" && (
              <Button variant="outline" onClick={() => retry("general")}>
                换通用模式重试
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
