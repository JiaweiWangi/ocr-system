import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveImage } from "@/lib/storage";
import { processTask } from "@/lib/pipeline/runner";

/**
 * POST /api/tasks —— multipart 上传，创建任务并触发处理（不 await，内存异步）
 * GET  /api/tasks —— 任务列表（最近优先）
 */

const MAX_SIZE = 8 * 1024 * 1024; // 百度 general 接口限制 base64 后 ≤ 8M（原文件约 6M）

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少 image 文件" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "图片过大（>6MB），请压缩后重试" },
        { status: 400 },
      );
    }

    const modeRaw = form.get("mode");
    const mode = modeRaw === "table" || modeRaw === "deep" ? modeRaw : "general";
    const precisionRaw = form.get("precision");
    const precision = precisionRaw === "high" ? "high" : "standard";

    const title = (form.get("title") as string | null) || file.name || "未命名";

    // 先建 Task 拿 id，再用 id 命名图片
    const task = await prisma.task.create({
      data: {
        title,
        mode,
        precision,
        status: "pending",
        imagePath: "", // 占位，下面更新
      },
    });

    const imagePath = await saveImage(task.id, file);
    await prisma.task.update({ where: { id: task.id }, data: { imagePath } });

    // 异步触发，不阻塞响应
    void processTask(task.id).catch(() => undefined);

    return NextResponse.json({ id: task.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建任务失败" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      status: true,
      imagePath: true,
      createdAt: true,
      error: true,
    },
  });
  return NextResponse.json({ tasks });
}
