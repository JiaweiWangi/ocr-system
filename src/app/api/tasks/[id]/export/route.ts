import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toTxt, toMarkdown } from "@/lib/export";
import { toDocx } from "@/lib/export/toDocx";
import { toXlsx } from "@/lib/export/toXlsx";
import { ocrDocumentSchema } from "@/lib/normalize/types";

/**
 * GET /api/tasks/[id]/export?format=txt|md|docx|xlsx&version=n
 * 流式返回文件（Content-Disposition: attachment），同时写 ExportRecord。
 */

const FORMATS = ["txt", "md", "docx", "xlsx"] as const;
type Format = (typeof FORMATS)[number];

const MIME: Record<Format, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "识别结果";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") as Format | null;
  if (!format || !FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `format 必须是 ${FORMATS.join("/")}` },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const versionNoParam = searchParams.get("version");
  const version = versionNoParam
    ? await prisma.documentVersion.findFirst({
        where: { taskId: id, versionNo: Number(versionNoParam) },
      })
    : await prisma.documentVersion.findFirst({
        where: { taskId: id, isCurrent: true },
      });
  if (!version) return NextResponse.json({ error: "版本不存在" }, { status: 404 });

  const parsed = ocrDocumentSchema.safeParse(JSON.parse(version.content));
  if (!parsed.success) {
    return NextResponse.json({ error: "文档内容损坏" }, { status: 500 });
  }
  const doc = parsed.data;

  const fileName = `${safeFileName(task.title)}.${format}`;
  let body: Buffer | string;

  switch (format) {
    case "txt":
      body = toTxt(doc);
      break;
    case "md":
      body = toMarkdown(doc);
      break;
    case "docx":
      body = await toDocx(doc, task.title);
      break;
    case "xlsx":
      body = await toXlsx(doc);
      break;
  }

  await prisma.exportRecord.create({
    data: { taskId: id, versionId: version.id, format, fileName },
  });

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
