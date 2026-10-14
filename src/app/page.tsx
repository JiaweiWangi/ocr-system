import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { Badge } from "@/components/ui/badge";

// 允许阻塞渲染（读数据库，无需流式加载）
export const instant = false;

const MODE_LABEL: Record<string, string> = {
  general: "通用",
  table: "表格",
  deep: "深度",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-500/10 text-blue-600",
  success: "bg-green-500/10 text-green-700",
  failed: "bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "等待中",
  processing: "识别中",
  success: "已完成",
  failed: "失败",
};

export default async function Home() {
  await connection(); // 读取数据库，动态渲染
  const recent = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, title: true, mode: true, status: true, createdAt: true },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          多版式 OCR 文档识别与在线处理系统
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          图片输入 → OCR 识别 → 结构化处理 → 在线编辑 → 结果下载
        </p>
      </header>

      <UploadDropzone />

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">最近任务</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((t) => (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors hover:border-muted-foreground/40"
              >
                <span className="truncate">{t.title}</span>
                <span className="ml-3 flex shrink-0 items-center gap-1.5">
                  <Badge variant="secondary">{MODE_LABEL[t.mode] ?? t.mode}</Badge>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status] ?? ""}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
