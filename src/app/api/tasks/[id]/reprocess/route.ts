import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processTask } from "@/lib/pipeline/runner";
import { expireTasks, newAttempt } from "@/lib/pipeline/lifecycle";
import { InputError, recognitionOptions } from "@/lib/upload";

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
  let body: { mode?: string; precision?: string };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("请求内容必须为 JSON 对象");
    recognitionOptions(body.mode, body.precision);
  } catch (error) {
    return NextResponse.json({ error: error instanceof InputError ? error.message : "无效的 JSON 请求" }, { status: 400 });
  }
  await expireTasks(id);
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  const attempt = newAttempt();
  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.task.updateMany({
      where: { id, attemptId: task.attemptId, status: { in: ["success", "failed"] } },
      data: {
        mode: body.mode ?? task.mode,
        precision: body.precision ?? task.precision,
        status: "pending",
        error: null,
        engineTaskId: null,
        lastPolledAt: null,
        ...attempt,
      },
    });
    if (!result.count) return false;
    await tx.documentVersion.deleteMany({ where: { taskId: id } });
    await tx.rawResult.deleteMany({ where: { taskId: id } });
    return true;
  });
  if (!claimed) return NextResponse.json({ error: "任务正在处理中，请等待完成后再重试" }, { status: 409 });
  after(() => processTask(id, attempt.attemptId).catch(() => console.error("Could not reprocess task", id)));
  return NextResponse.json({ ok: true });
}
