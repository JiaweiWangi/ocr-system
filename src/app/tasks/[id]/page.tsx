import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { TaskStatusPanel } from "@/components/task/TaskStatusPanel";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { ocrDocumentSchema } from "@/lib/normalize/types";

// 允许阻塞渲染（读数据库，无需流式加载）
export const instant = false;

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection(); // 读取数据库，动态渲染
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNo: "asc" },
        select: { id: true, versionNo: true, label: true, isCurrent: true, createdAt: true },
      },
    },
  });
  if (!task) notFound();

  // 处理中/失败 → 状态面板；成功 → 编辑器
  if (task.status !== "success") {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
        <TaskStatusPanel
          taskId={task.id}
          title={task.title}
          status={task.status}
          mode={task.mode}
          error={task.error}
        />
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← 返回上传
          </Link>
        </div>
      </main>
    );
  }

  const current = await prisma.documentVersion.findFirst({
    where: { taskId: task.id, isCurrent: true },
  });
  if (!current) notFound();

  const parsed = ocrDocumentSchema.safeParse(JSON.parse(current.content));
  if (!parsed.success) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <div className="text-destructive">识别结果数据损坏，请尝试重新识别</div>
      </main>
    );
  }

  return (
    <DocumentEditor
      taskId={task.id}
      title={task.title}
      mode={task.mode}
      initialDoc={JSON.parse(JSON.stringify(parsed.data))}
      imageWidth={task.imageWidth ?? 0}
      imageHeight={task.imageHeight ?? 0}
      versions={task.versions.map((v) => ({
        versionNo: v.versionNo,
        label: v.label,
        isCurrent: v.isCurrent,
      }))}
    />
  );
}
