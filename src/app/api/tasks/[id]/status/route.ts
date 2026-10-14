import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pollDeepTask } from "@/lib/pipeline/pollOnDemand";

/**
 * GET /api/tasks/[id]/status —— 前端轮询入口。
 * 深度模式任务在此触发按需轮询（poll-on-demand），查询百度推进状态。
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, status: true, mode: true, error: true },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  if (task.mode === "deep" && task.status === "processing") {
    try {
      await pollDeepTask(id);
    } catch {
      // 轮询失败不报给前端，下次轮询重试
    }
  }

  const fresh = await prisma.task.findUnique({
    where: { id },
    select: { status: true, error: true },
  });
  return NextResponse.json(fresh);
}
