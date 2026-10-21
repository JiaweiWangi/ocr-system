import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pollDeepTask } from "@/lib/pipeline/pollOnDemand";
import { expireTasks } from "@/lib/pipeline/lifecycle";

/**
 * GET /api/tasks/[id]/status —— 前端轮询入口。
 * 深度模式任务在此触发按需轮询（poll-on-demand），查询百度推进状态。
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await expireTasks(id);
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, status: true, mode: true, error: true },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  if (task.mode === "deep" && task.status === "processing") {
    try {
      await pollDeepTask(id);
    } catch {
      return NextResponse.json({ error: "读取识别状态失败，请稍后重试" }, { status: 503 });
    }
  }

  const fresh = await prisma.task.findUnique({
    where: { id },
    select: { status: true, error: true },
  });
  return NextResponse.json(fresh);
}
