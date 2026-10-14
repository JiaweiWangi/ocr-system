import { prisma } from "@/lib/db";
import { imageToBase64, imageSize } from "@/lib/storage";
import { runGeneral, runTable, runParserSubmit, PARSER_FAILED } from "@/lib/baidu";
import { fromGeneral } from "@/lib/normalize/fromGeneral";
import { fromTable } from "@/lib/normalize/fromTable";
import { ocrDocumentSchema } from "@/lib/normalize/types";

/**
 * 处理管线编排：按模式调接口 → 存 RawResult → 归一化 → 建 version 1。
 *
 * general/table 模式为同步管线，processTask 一次性跑完。
 * 深度模式只负责 submit（存 engineTaskId），完成检测交给 pollOnDemand。
 */

export async function processTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "processing" },
    });

    const imageBase64 = await imageToBase64(task.imagePath);
    const size = await imageSize(task.imagePath);
    if (size) {
      await prisma.task.update({
        where: { id: taskId },
        data: { imageWidth: size.width, imageHeight: size.height },
      });
    }
    const image = {
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      path: task.imagePath,
    };

    // fixture 回放按原始文件名选样张（title 默认取上传文件名）
    const fileName = task.title || "default";

    if (task.mode === "deep") {
      const engineTaskId = await runParserSubmit(imageBase64, fileName);
      await prisma.task.update({
        where: { id: taskId },
        data: { engineTaskId },
      });
      return; // 后续由 pollOnDemand 接手
    }

    let doc;

    if (task.mode === "table") {
      const [tableResult, generalResult] = await Promise.all([
        runTable(imageBase64, fileName),
        runGeneral(imageBase64, fileName).catch(() => undefined), // 表外文字可选，失败不阻塞
      ]);
      await prisma.rawResult.createMany({
        data: [
          {
            taskId,
            engine: "table",
            payload: JSON.stringify(tableResult),
          },
          ...(generalResult
            ? [{ taskId, engine: "general", payload: JSON.stringify(generalResult) }]
            : []),
        ],
      });
      doc = fromTable(tableResult, image, generalResult);
    } else {
      const precision = task.precision === "high" ? "high" : "standard";
      const result = await runGeneral(imageBase64, fileName, precision);
      await prisma.rawResult.create({
        data: {
          taskId,
          engine: precision === "high" ? "accurate" : "general",
          payload: JSON.stringify(result),
        },
      });
      doc = fromGeneral(result, image, precision === "high" ? "accurate" : "general");
    }

    // zod 校验后写入 version 1
    const parsed = ocrDocumentSchema.parse(doc);

    const count = await prisma.documentVersion.count({ where: { taskId } });
    await prisma.documentVersion.create({
      data: {
        taskId,
        versionNo: count + 1,
        label: "初始识别",
        content: JSON.stringify(parsed),
        isCurrent: true,
      },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "success", error: null },
    });
  } catch (err) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export { PARSER_FAILED };
