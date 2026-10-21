import { prisma } from "@/lib/db";
import { runParserPoll, PARSER_DONE, PARSER_FAILED } from "@/lib/baidu";
import { fromParser } from "@/lib/normalize/fromParser";
import { ocrDocumentSchema } from "@/lib/normalize/types";
import { extractKeyInfo } from "@/lib/kie/extract";
import { completeTask, expireTasks, failTask, storeRawResults, withTaskDeadline } from "./lifecycle";

const MIN_POLL_INTERVAL_MS = 3000;
// Coalesce overlapping requests in this process; the DB guards also protect retries and completion.
const inFlight = new Map<string, Promise<void>>();

export async function pollDeepTask(taskId: string): Promise<void> {
  const running = inFlight.get(taskId);
  if (running) return running;
  const poll = pollOnce(taskId).finally(() => inFlight.delete(taskId));
  inFlight.set(taskId, poll);
  return poll;
}

async function pollOnce(taskId: string) {
  await expireTasks(taskId);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.mode !== "deep" || task.status !== "processing" || !task.engineTaskId) return;
  const now = new Date();
  const claimed = await prisma.task.updateMany({
    where: {
      id: task.id, attemptId: task.attemptId, status: "processing",
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lte: new Date(now.getTime() - MIN_POLL_INTERVAL_MS) } }],
    },
    data: { lastPolledAt: now },
  });
  if (!claimed.count) return;

  await withTaskDeadline(task, async (signal) => {
    const { status, parseResult } = await runParserPoll(task.engineTaskId!, task.title || "default", signal);
    if (status === PARSER_FAILED) {
      await failTask(task, "文档解析失败（百度侧处理失败），请重试");
      return;
    }
    if (status !== PARSER_DONE) return;
    if (!parseResult) throw new Error("文档解析完成但结果为空");
    if (!await storeRawResults(task, [{ engine: "parser", payload: parseResult }])) return;
    const doc = fromParser(parseResult, {
      width: task.imageWidth ?? 0, height: task.imageHeight ?? 0, path: task.imagePath,
    });
    const parsed = ocrDocumentSchema.parse(doc);
    const kv = extractKeyInfo(parsed);
    if (kv) parsed.blocks.push(kv);
    signal.throwIfAborted();
    await completeTask(task, parsed);
  });
}
