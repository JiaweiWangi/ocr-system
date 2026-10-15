import { prisma } from "@/lib/db";
import { runParserPoll, PARSER_DONE, PARSER_FAILED } from "@/lib/baidu";
import { fromParser } from "@/lib/normalize/fromParser";
import { ocrDocumentSchema } from "@/lib/normalize/types";

/**
 * 深度模式按需轮询（poll-on-demand）：
 *
 * 前端每次查 status 时调用；距上次真实查询 ≥3s 才向百度发起 query。
 * 无常驻定时器，dev server 重启后自动恢复（状态全在 DB，幂等）。
 */

const MIN_POLL_INTERVAL_MS = 3000;

export async function pollDeepTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.mode !== "deep" || task.status !== "processing") return;
  if (!task.engineTaskId) return;

  // 节流：上次查询距今太近则跳过
  if (task.lastPolledAt && Date.now() - task.lastPolledAt.getTime() < MIN_POLL_INTERVAL_MS) {
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { lastPolledAt: new Date() },
  });

  const fileName = task.title || "default";
  const { status, parseResult } = await runParserPoll(task.engineTaskId, fileName);

  if (status === PARSER_FAILED) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", error: "文档解析失败（百度侧处理失败）" },
    });
    return;
  }

  if (status === PARSER_DONE && parseResult) {
    try {
      // RawResult 存档（parse_result_url 是临时链接，立即落地）
      await prisma.rawResult.create({
        data: { taskId, engine: "parser", payload: JSON.stringify(parseResult) },
      });

      const size = await prisma.task
        .findUnique({ where: { id: taskId } })
        .then((t) => (t?.imageWidth && t?.imageHeight ? { width: t.imageWidth, height: t.imageHeight } : null));

      const doc = fromParser(parseResult, {
        width: size?.width ?? 0,
        height: size?.height ?? 0,
        path: task.imagePath,
      });
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
  // 其余 status：仍在处理中，等待下次轮询
}
