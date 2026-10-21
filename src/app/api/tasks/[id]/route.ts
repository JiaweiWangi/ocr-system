import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expireTasks } from "@/lib/pipeline/lifecycle";

/**
 * GET    /api/tasks/[id] —— 任务详情 + 当前版本内容
 * DELETE /api/tasks/[id] —— 删除任务（级联删版本/原始结果/导出记录；图片文件一并清理）
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await expireTasks(id);
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNo: "asc" },
        select: { id: true, versionNo: true, label: true, isCurrent: true, createdAt: true },
      },
    },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const current = await prisma.documentVersion.findFirst({
    where: { taskId: id, isCurrent: true },
  });

  return NextResponse.json({
    task,
    content: current ? JSON.parse(current.content) : null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/tasks/[id] —— 改题名。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = body.title?.trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "题名不能为空" }, { status: 400 });

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  await prisma.task.update({ where: { id }, data: { title } });
  return NextResponse.json({ ok: true });
}
