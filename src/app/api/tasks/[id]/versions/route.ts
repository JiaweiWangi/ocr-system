import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET  /api/tasks/[id]/versions —— 版本列表
 * POST /api/tasks/[id]/versions —— 手动快照（新版本号）
 * PUT  /api/tasks/[id]/versions —— 回滚到指定版本（复制为新当前版本）
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const versions = await prisma.documentVersion.findMany({
    where: { taskId: id },
    orderBy: { versionNo: "asc" },
    select: { id: true, versionNo: true, label: true, isCurrent: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { label } = (await req.json().catch(() => ({}))) as { label?: string };

  const current = await prisma.documentVersion.findFirst({
    where: { taskId: id, isCurrent: true },
  });
  if (!current) return NextResponse.json({ error: "没有当前版本" }, { status: 409 });

  const count = await prisma.documentVersion.count({ where: { taskId: id } });
  const created = await prisma.documentVersion.create({
    data: {
      taskId: id,
      versionNo: count + 1,
      label: label || `快照 v${count + 1}`,
      content: current.content,
      isCurrent: true,
    },
  });
  await prisma.documentVersion.update({
    where: { id: current.id },
    data: { isCurrent: false },
  });

  return NextResponse.json({ id: created.id, versionNo: created.versionNo }, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { versionNo } = (await req.json()) as { versionNo: number };
  if (typeof versionNo !== "number") {
    return NextResponse.json({ error: "缺少 versionNo" }, { status: 400 });
  }

  const target = await prisma.documentVersion.findFirst({
    where: { taskId: id, versionNo },
  });
  if (!target) return NextResponse.json({ error: "版本不存在" }, { status: 404 });

  // 回滚 = 把目标版本内容复制为新的当前版本（不丢历史）
  const current = await prisma.documentVersion.findFirst({
    where: { taskId: id, isCurrent: true },
  });
  const count = await prisma.documentVersion.count({ where: { taskId: id } });

  await prisma.$transaction([
    ...(current
      ? [prisma.documentVersion.update({ where: { id: current.id }, data: { isCurrent: false } })]
      : []),
    prisma.documentVersion.create({
      data: {
        taskId: id,
        versionNo: count + 1,
        label: `回滚自 v${versionNo}`,
        content: target.content,
        isCurrent: true,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
