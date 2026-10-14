import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processTask } from "@/lib/pipeline/runner";

/**
 * POST /api/tasks/[id]/reprocess —— 失败重试 / 换模式重跑。
 * body: { mode?: 'general'|'table'|'deep', precision?: 'standard'|'high' }
 * 重跑会清掉旧版本与原始结果，生成新的 version 1。
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    precision?: string;
  };

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const mode =
    body.mode === "table" || body.mode === "deep" || body.mode === "general"
      ? body.mode
      : task.mode;
  const precision = body.precision === "high" ? "high" : body.precision === "standard" ? "standard" : task.precision;

  await prisma.$transaction([
    prisma.documentVersion.deleteMany({ where: { taskId: id } }),
    prisma.rawResult.deleteMany({ where: { taskId: id } }),
    prisma.task.update({
      where: { id },
      data: {
        mode,
        precision,
        status: "pending",
        error: null,
        engineTaskId: null,
        lastPolledAt: null,
      },
    }),
  ]);

  void processTask(id).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
