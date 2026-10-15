"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import TaskEditor from "@/components/editor/TaskEditor";
import { EmptyContentPanel, FailedPanel, ProcessingPanel } from "@/components/editor/StatusPanels";
import { fetchJson, type TaskDetail } from "@/lib/client/api";

/**
 * 任务详情：按状态分流 —— 进行中轮询 / 失败重试 / 成功进编辑器。
 */
export default function TaskPageClient({ id }: { id: string }) {
  const [data, setData] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<TaskDetail>(`/api/tasks/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "任务加载失败");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取详情，setState 均发生在 await 之后
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <TopBar />
        <main className="grid flex-1 place-items-center px-6">
          <div className="rounded-[14px] bg-card px-8 py-6 text-center shadow-card">
            <p className="text-[14px] text-red-deep">{error}</p>
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopBar compact />
        <main className="grid flex-1 place-items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-red" />
        </main>
      </>
    );
  }

  const { task, content } = data;

  return (
    <>
      <TopBar compact />
      {task.status === "pending" || task.status === "processing" ? (
        <ProcessingPanel taskId={task.id} mode={task.mode} onDone={() => void load()} />
      ) : task.status === "failed" ? (
        <FailedPanel
          taskId={task.id}
          title={task.title}
          error={task.error}
          mode={task.mode}
          onRetry={() => void load()}
        />
      ) : content ? (
        <TaskEditor data={data} onReload={() => void load()} />
      ) : (
        <EmptyContentPanel onRetry={() => void load()} />
      )}
    </>
  );
}
