import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveImagePath } from "@/lib/storage";
import fs from "node:fs/promises";

/**
 * Default: OCR image and coordinates. variant=original: download the unchanged upload.
 */

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const original = req.nextUrl.searchParams.get("variant") === "original";
  const imagePath = original ? task.originalImagePath ?? task.imagePath : task.imagePath;
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  try {
    const buf = await fs.readFile(resolveImagePath(imagePath));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        ...(original ? { "Content-Disposition": `attachment; filename="${task.id}-original.${ext}"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "图片文件丢失" }, { status: 404 });
  }
}
