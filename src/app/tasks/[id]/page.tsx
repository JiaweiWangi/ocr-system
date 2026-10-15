import { Suspense } from "react";
import TaskPageClient from "@/components/TaskPageClient";

/**
 * 任务详情页（服务端壳）：解析动态路由参数后交给客户端组件。
 * cacheComponents 下动态 params 需在 Suspense 内 await。
 */
export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <TaskParams params={params} />
    </Suspense>
  );
}

async function TaskParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskPageClient id={id} />;
}
