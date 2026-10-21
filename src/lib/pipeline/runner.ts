import { prisma } from "@/lib/db";
import { imageToBase64, imageSize } from "@/lib/storage";
import { runGeneral, runTable, runParserSubmit, PARSER_FAILED } from "@/lib/baidu";
import { fromGeneral } from "@/lib/normalize/fromGeneral";
import { fromTable } from "@/lib/normalize/fromTable";
import { ocrDocumentSchema } from "@/lib/normalize/types";
import { extractKeyInfo } from "@/lib/kie/extract";
import { completeTask, expireTasks, storeRawResults, withTaskDeadline } from "./lifecycle";

/**
 * 处理管线编排：按模式调接口 → 存 RawResult → 归一化 → 建 version 1。
 *
 * general/table 模式为同步管线，processTask 一次性跑完。
 * 深度模式只负责 submit（存 engineTaskId），完成检测交给 pollOnDemand。
 */

export async function processTask(taskId: string, attemptId: string): Promise<void> {
  await expireTasks(taskId);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.attemptId !== attemptId || task.status !== "pending") return;

  await withTaskDeadline(task, async (signal) => {
    const claimed = await prisma.task.updateMany({
      where: { id: taskId, attemptId, status: "pending", deadlineAt: { gt: new Date() } },
      data: { status: "processing" },
    });
    if (!claimed.count) return;

    const imageBase64 = await imageToBase64(task.imagePath);
    const size = await imageSize(task.imagePath);
    if (!size) throw new Error("无法读取图片尺寸");
    await prisma.task.updateMany({
      where: { id: taskId, attemptId, status: "processing" },
      data: { imageWidth: size.width, imageHeight: size.height },
    });
    const image = {
      width: size.width,
      height: size.height,
      path: task.imagePath,
    };

    // fixture 回放按原始文件名选样张（title 默认取上传文件名）
    const fileName = task.title || "default";

    if (task.mode === "deep") {
      // 真实调用的 file_name 必须带正确扩展名，取落盘文件名（title 可被编辑，不可靠）
      const realFileName = task.imagePath.split("/").pop() || "image.png";
      const engineTaskId = await runParserSubmit(imageBase64, realFileName, signal);
      await prisma.task.updateMany({
        where: { id: taskId, attemptId, status: "processing", deadlineAt: { gt: new Date() } },
        data: { engineTaskId },
      });
      return; // 后续由 pollOnDemand 接手
    }

    let doc;

    if (task.mode === "table") {
      const [tableResult, generalResult] = await Promise.all([
        runTable(imageBase64, fileName, signal),
        runGeneral(imageBase64, fileName, "standard", signal).catch(() => undefined), // 表外文字可选，失败不阻塞
      ]);
      if (!await storeRawResults(task, [
        { engine: "table", payload: tableResult },
        ...(generalResult ? [{ engine: "general", payload: generalResult }] : []),
      ])) return;
      doc = fromTable(tableResult, image, generalResult);
    } else {
      const precision = task.precision === "high" ? "high" : "standard";
      const result = await runGeneral(imageBase64, fileName, precision, signal);
      if (!await storeRawResults(task, [{ engine: precision === "high" ? "accurate" : "general", payload: result }])) return;
      doc = fromGeneral(result, image, precision === "high" ? "accurate" : "general");
    }

    // zod 校验 → 规则式关键信息提取 → 写入 version 1
    const parsed = ocrDocumentSchema.parse(doc);
    const kv = extractKeyInfo(parsed);
    if (kv) parsed.blocks.push(kv);

    signal.throwIfAborted();
    await completeTask(task, parsed);
  });
}

export { PARSER_FAILED };
