import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveImagePath } from "@/lib/storage";
import fs from "node:fs/promises";

/**
 * GET /api/tasks/[id]/image —— 返回任务原图（编辑器左侧展示用）
 */

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const ext = task.imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  try {
    const buf = await fs.readFile(resolveImagePath(task.imagePath));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "图片文件丢失" }, { status: 404 });
  }
}
