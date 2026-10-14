import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { HistoryList } from "@/components/history/HistoryList";

// 允许阻塞渲染（读数据库，无需流式加载）
export const instant = false;

export default async function HistoryPage() {
  await connection(); // 读取数据库，动态渲染
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      status: true,
      imagePath: true,
      createdAt: true,
      error: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">历史记录</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回上传
        </Link>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          还没有识别任务，先上传一张图片试试
        </div>
      ) : (
        <HistoryList
          tasks={tasks.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      )}
    </main>
  );
}
