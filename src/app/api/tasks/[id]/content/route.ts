import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ocrDocumentSchema } from "@/lib/normalize/types";

/**
 * PUT /api/tasks/[id]/content —— 自动保存：覆盖当前版本内容。
 * zod 服务端校验，防止前端状态损坏污染存储。
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = ocrDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "文档格式校验失败", detail: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const current = await prisma.documentVersion.findFirst({
    where: { taskId: id, isCurrent: true },
  });
  if (!current) {
    return NextResponse.json({ error: "没有可保存的版本" }, { status: 409 });
  }

  await prisma.documentVersion.update({
    where: { id: current.id },
    data: { content: JSON.stringify(parsed.data) },
  });

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
