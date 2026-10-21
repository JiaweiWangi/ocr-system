import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { saveImage, removeImage } from "@/lib/storage";
import { processTask } from "@/lib/pipeline/runner";
import { isMockMode } from "@/lib/baidu/fixtures";
import { InputError, readUploadForm, recognitionOptions, validateImage } from "@/lib/upload";
import { expireTasks, newAttempt } from "@/lib/pipeline/lifecycle";

/**
 * POST /api/tasks —— 校验、落盘、创建任务，响应后启动识别
 * GET  /api/tasks —— 任务列表（最近优先）
 */

export async function POST(req: NextRequest) {
  let imagePath: string | undefined;
  try {
    const form = await readUploadForm(req);
    const file = form.get("image");
    if (!(file instanceof File) || form.getAll("image").length !== 1) throw new InputError("请上传一张 image 图片");
    const { mode, precision } = recognitionOptions(form.get("mode"), form.get("precision"));
    const titleRaw = form.get("title");
    if (titleRaw !== null && typeof titleRaw !== "string") throw new InputError("题名必须为文本");
    const title = (titleRaw?.trim() || file.name || "未命名").slice(0, 120);
    const image = await validateImage(file);
    const id = randomUUID();
    imagePath = await saveImage(id, file, image.buffer);
    const attempt = newAttempt();
    const task = await prisma.task.create({
      data: {
        id, title, mode, precision, status: "pending", imagePath,
        imageWidth: image.width, imageHeight: image.height, ...attempt,
      },
    });
    imagePath = undefined; // The task now owns the file.
    after(() => processTask(task.id, attempt.attemptId).catch(() => {
      console.error("Could not process task", task.id);
    }));
    return NextResponse.json({ id: task.id }, { status: 201 });
  } catch (err) {
    if (imagePath) await removeImage(imagePath).catch(() => console.error("Could not clean up failed upload"));
    return NextResponse.json(
      { error: err instanceof InputError ? err.message : "创建任务失败，请稍后重试" },
      { status: err instanceof InputError ? err.status : 500 },
    );
  }
}

export async function GET() {
  await expireTasks();
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      precision: true,
      status: true,
      imagePath: true,
      createdAt: true,
      error: true,
    },
  });
  return NextResponse.json({ tasks, mock: isMockMode() });
}
