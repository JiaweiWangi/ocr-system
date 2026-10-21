import { randomUUID } from "node:crypto";
import type { Task } from "@prisma/client";
import { prisma } from "../db";
import { BaiduApiError } from "../baidu/client";
import { BaiduTokenError } from "../baidu/token";
import { UpstreamError } from "../baidu/http";
import type { OcrDocument } from "../normalize/types";

export const TASK_TIMEOUT_MS = 5 * 60_000;
export const TASK_TIMEOUT_MESSAGE = "识别任务超时（超过 5 分钟），请重试";

export function newAttempt() {
  return { attemptId: randomUUID(), deadlineAt: new Date(Date.now() + TASK_TIMEOUT_MS) };
}

export function taskDeadline(task: Pick<Task, "deadlineAt" | "createdAt">): number {
  return task.deadlineAt?.getTime() ?? task.createdAt.getTime() + TASK_TIMEOUT_MS;
}

export async function expireTasks(id?: string) {
  const now = new Date();
  await prisma.task.updateMany({
    where: {
      ...(id ? { id } : {}),
      status: { in: ["pending", "processing"] },
      OR: [
        { deadlineAt: { lte: now } },
        { deadlineAt: null, createdAt: { lte: new Date(now.getTime() - TASK_TIMEOUT_MS) } },
      ],
    },
    data: { status: "failed", error: TASK_TIMEOUT_MESSAGE },
  });
}

function activeAttempt(task: Task) {
  const now = new Date();
  return {
    id: task.id, attemptId: task.attemptId, status: "processing",
    OR: [
      { deadlineAt: { gt: now } },
      { deadlineAt: null, createdAt: { gt: new Date(now.getTime() - TASK_TIMEOUT_MS) } },
    ],
  };
}

export function failureMessage(error: unknown): string {
  if (error instanceof BaiduApiError) {
    const hint = error.code === 17 ? "额度已用尽，请检查百度控制台"
      : error.code === 18 ? "请求过于频繁，请稍后重试"
      : error.code === 110 || error.code === 111 ? "访问凭证无效，请检查密钥配置"
      : "请检查图片、接口权限或稍后重试";
    return `百度 OCR 错误 ${error.code}：${hint}`;
  }
  if (error instanceof BaiduTokenError || error instanceof UpstreamError) return error.message;
  return "识别处理失败，请检查图片或稍后重试";
}

export async function failTask(task: Task, message: string) {
  await prisma.task.updateMany({
    where: { id: task.id, attemptId: task.attemptId, status: { in: ["pending", "processing"] } },
    data: { status: "failed", error: message },
  });
}

export async function withTaskDeadline(task: Task, work: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  const remaining = taskDeadline(task) - Date.now();
  if (remaining <= 0) {
    await failTask(task, TASK_TIMEOUT_MESSAGE);
    return;
  }
  const timer = setTimeout(() => {
    controller.abort(new Error(TASK_TIMEOUT_MESSAGE));
    void failTask(task, TASK_TIMEOUT_MESSAGE).catch(() => {
      console.error("Could not persist task timeout", task.id);
    });
  }, remaining);
  timer.unref?.();
  try {
    await work(controller.signal);
  } catch (error) {
    await failTask(task, controller.signal.aborted || Date.now() >= taskDeadline(task)
      ? TASK_TIMEOUT_MESSAGE : failureMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

/** Guard and writes share a transaction, so timeout/retry cannot interleave with completion. */
export async function storeRawResults(task: Task, raws: { engine: string; payload: unknown }[]) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.task.updateMany({ where: activeAttempt(task), data: { error: null } });
    if (!claim.count) return false;
    await tx.rawResult.createMany({ data: raws.map((raw) => ({ taskId: task.id, engine: raw.engine, payload: JSON.stringify(raw.payload) })) });
    return true;
  });
}

export async function completeTask(task: Task, doc: OcrDocument) {
  await prisma.$transaction(async (tx) => {
    const claim = await tx.task.updateMany({ where: activeAttempt(task), data: { status: "success", error: null } });
    if (!claim.count) return;
    const count = await tx.documentVersion.count({ where: { taskId: task.id } });
    await tx.documentVersion.updateMany({ where: { taskId: task.id, isCurrent: true }, data: { isCurrent: false } });
    await tx.documentVersion.create({ data: {
      taskId: task.id, versionNo: count + 1, label: "初始识别", content: JSON.stringify(doc), isCurrent: true,
    } });
  });
}
