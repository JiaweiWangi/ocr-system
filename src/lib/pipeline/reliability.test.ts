import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { PrismaClient, type Task } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { completeTask, expireTasks, failTask, newAttempt, TASK_TIMEOUT_MESSAGE, withTaskDeadline } from "./lifecycle";
import { processTask } from "./runner";
import { pollDeepTask } from "./pollOnDemand";
import type { OcrDocument } from "../normalize/types";
import { UpstreamError } from "../baidu/http";
import { NextRequest } from "next/server";
import { POST as upload } from "../../app/api/tasks/route";
import { POST as retry } from "../../app/api/tasks/[id]/reprocess/route";
import { DELETE as deleteTask } from "../../app/api/tasks/[id]/route";
import sharp from "sharp";

const state = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
const engines = vi.hoisted(() => ({ runGeneral: vi.fn(), runTable: vi.fn(), runParserSubmit: vi.fn(), runParserPoll: vi.fn() }));
const uploads = vi.hoisted(() => ({ saveImage: vi.fn(), removeImage: vi.fn() }));
const afterWork = vi.hoisted(() => [] as (() => Promise<unknown>)[]);
vi.mock("../db", () => ({ get prisma() { return state.prisma; } }));
vi.mock("../baidu", () => ({ ...engines, PARSER_DONE: "success", PARSER_FAILED: "failed" }));
vi.mock("../storage", async (original) => ({ ...await original<object>(), ...uploads }));
vi.mock("next/server", async (original) => ({
  ...await original<object>(), after: (callback: () => Promise<unknown>) => afterWork.push(callback),
}));

let dir: string;
const doc: OcrDocument = { schemaVersion: 1, image: { width: 100, height: 100, path: "sample.png" }, blocks: [] };
const fixture = (engine: string) => JSON.parse(readFileSync(`fixtures/${engine}-default.json`, "utf8"));

async function task(data: Partial<Task> = {}) {
  return state.prisma.task.create({ data: {
    title: "test.png", mode: "general", precision: "standard", status: "pending",
    imagePath: "samples/发票测试.png", ...newAttempt(), ...data,
  } });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ocr-reliability-"));
  const file = join(dir, "test.db");
  const db = new Database(file);
  db.exec(readFileSync("prisma/migrations/20261014115632_init/migration.sql", "utf8"));
  db.exec(readFileSync("prisma/migrations/20261021120000_task_deadline/migration.sql", "utf8"));
  db.exec(readFileSync("prisma/migrations/20261021150000_image_preprocessing/migration.sql", "utf8"));
  db.close();
  state.prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
});
beforeEach(async () => {
  vi.resetAllMocks();
  afterWork.length = 0;
  uploads.saveImage.mockImplementation(async (id: string, file: File) => `storage/images/${id.endsWith("-original") ? "original" : "test"}.${file.type === "image/jpeg" ? "jpg" : "png"}`);
  uploads.removeImage.mockResolvedValue(undefined);
  await state.prisma.task.deleteMany();
});
afterAll(async () => { await state.prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("task reliability with SQLite", () => {
  it("finishes a general task and archives its initial result", async () => {
    const t = await task();
    engines.runGeneral.mockResolvedValue(fixture("general"));
    await processTask(t.id, t.attemptId!);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "success", error: null });
    expect(await state.prisma.documentVersion.count()).toBe(1);
    expect(await state.prisma.rawResult.count()).toBe(1);
  });

  it("keeps the table result when optional outside-text recognition fails", async () => {
    const t = await task({ mode: "table" });
    engines.runTable.mockResolvedValue(fixture("table"));
    engines.runGeneral.mockRejectedValue(new UpstreamError("OCR 超时"));
    await processTask(t.id, t.attemptId!);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "success" });
  });

  it("persists request failures instead of leaving a task processing", async () => {
    const t = await task();
    engines.runGeneral.mockRejectedValue(new UpstreamError("百度 OCR 请求超时，请重试"));
    await processTask(t.id, t.attemptId!);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "failed", error: "百度 OCR 请求超时，请重试" });
  });

  it("expires abandoned pending/processing tasks after restart, including legacy tasks", async () => {
    const old = new Date(Date.now() - 360_000);
    await task({ status: "processing", deadlineAt: old });
    await task({ status: "pending", deadlineAt: null, attemptId: null, createdAt: old });
    const done = await task({ status: "success", deadlineAt: old });
    await expireTasks();
    expect(await state.prisma.task.count({ where: { status: "failed", error: TASK_TIMEOUT_MESSAGE } })).toBe(2);
    expect(await state.prisma.task.findUnique({ where: { id: done.id } })).toMatchObject({ status: "success" });
  });

  it("actively aborts a running task at its persisted deadline", async () => {
    const t = await task({ status: "processing", deadlineAt: new Date(Date.now() + 50) });
    let aborted = false;
    await withTaskDeadline(t, (signal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); });
    }));
    expect(aborted).toBe(true);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "failed", error: TASK_TIMEOUT_MESSAGE });
  });

  it("cannot write a late success or failure over a retried attempt", async () => {
    const old = await task({ status: "processing" });
    const attempt = newAttempt();
    await state.prisma.task.update({ where: { id: old.id }, data: { ...attempt, status: "processing" } });
    await completeTask(old, doc);
    await failTask(old, "late failure");
    expect(await state.prisma.documentVersion.count()).toBe(0);
    expect(await state.prisma.task.findUnique({ where: { id: old.id } })).toMatchObject({ attemptId: attempt.attemptId, status: "processing" });
    const current = (await state.prisma.task.findUnique({ where: { id: old.id } }))!;
    await completeTask(current, doc);
    expect(await state.prisma.documentVersion.count()).toBe(1);
  });

  it("does not duplicate versions under overlapping completion", async () => {
    const t = await task({ status: "processing" });
    await Promise.all([completeTask(t, doc), completeTask(t, doc)]);
    expect(await state.prisma.documentVersion.count()).toBe(1);
  });

  it("does not commit results after the deadline, even before a status read", async () => {
    const t = await task({ status: "processing", deadlineAt: new Date(Date.now() - 1) });
    await completeTask(t, doc);
    expect(await state.prisma.documentVersion.count()).toBe(0);
    await expireTasks(t.id);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "failed" });
  });

  it("records deep-query errors as failures", async () => {
    const t = await task({ mode: "deep", status: "processing", engineTaskId: "remote-1" });
    engines.runParserPoll.mockRejectedValue(new UpstreamError("百度 OCR 请求超时，请重试"));
    await pollDeepTask(t.id);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "failed", error: "百度 OCR 请求超时，请重试" });
  });

  it("coalesces deep polling and writes just one initial version", async () => {
    const t = await task({ mode: "deep", status: "processing", engineTaskId: "remote-1", imageWidth: 100, imageHeight: 100 });
    engines.runParserPoll.mockResolvedValue({ status: "success", parseResult: fixture("parser") });
    await Promise.all([pollDeepTask(t.id), pollDeepTask(t.id)]);
    expect(engines.runParserPoll).toHaveBeenCalledTimes(1);
    expect(await state.prisma.documentVersion.count()).toBe(1);
    expect(await state.prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ status: "success" });
  });
});

describe("upload and retry routes", () => {
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const retryRequest = (body = "{}") => new NextRequest("http://localhost/api/tasks/test/reprocess", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
  function uploadRequest(file: File) {
    const form = new FormData();
    form.set("image", file);
    return new NextRequest("http://localhost/api/tasks", { method: "POST", body: form });
  }

  it("rejects bad uploads before writing files or creating tasks", async () => {
    const response = await upload(uploadRequest(new File(["fake"], "fake.png", { type: "image/png" })));
    expect(response.status).toBe(400);
    expect(await state.prisma.task.count()).toBe(0);
    expect(uploads.saveImage).not.toHaveBeenCalled();
    expect(afterWork).toHaveLength(0);
  });

  it("creates a valid task with dimensions and a persisted deadline", async () => {
    const response = await upload(uploadRequest(new File([readFileSync("samples/发票测试.png")], "test.png", { type: "image/png" })));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const t = await state.prisma.task.findUniqueOrThrow({ where: { id } });
    expect(t.status).toBe("pending");
    expect(t.imageWidth).toBeGreaterThan(15);
    expect(t.originalImagePath).toBe("storage/images/original.png");
    expect(JSON.parse(t.preprocessing!)).toMatchObject({ version: 1, output: { width: t.imageWidth, height: t.imageHeight } });
    expect(uploads.saveImage).toHaveBeenCalledTimes(2);
    expect(t.attemptId).toBeTruthy();
    expect(t.deadlineAt!.getTime()).toBeGreaterThan(Date.now());
    expect(afterWork).toHaveLength(1);
  });

  it("removes the saved image if database creation fails and hides internal errors", async () => {
    const create = vi.spyOn(state.prisma.task, "create").mockRejectedValueOnce(new Error("private database path"));
    try {
      const response = await upload(uploadRequest(new File([readFileSync("samples/发票测试.png")], "test.png", { type: "image/png" })));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private database path");
      expect(uploads.removeImage).toHaveBeenCalledWith("storage/images/test.png");
      expect(uploads.removeImage).toHaveBeenCalledWith("storage/images/original.png");
      expect(await state.prisma.task.count()).toBe(0);
    } finally { create.mockRestore(); }
  });

  it("keeps the original bytes and uses rotated dimensions for OCR", async () => {
    const jpeg = await sharp({ create: { width: 80, height: 40, channels: 3, background: "red" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const response = await upload(uploadRequest(new File([new Uint8Array(jpeg)], "rotated.jpg", { type: "image/jpeg" })));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(await state.prisma.task.findUniqueOrThrow({ where: { id } })).toMatchObject({ imageWidth: 40, imageHeight: 80 });
    expect(uploads.saveImage.mock.calls[1][2]).toEqual(jpeg);
    const processed = uploads.saveImage.mock.calls[0][2];
    expect(await sharp(processed).metadata()).toMatchObject({ width: 40, height: 80 });
  });

  it("cleans the processed image if saving the original fails", async () => {
    uploads.saveImage.mockResolvedValueOnce("storage/images/processed.png").mockRejectedValueOnce(new Error("disk full"));
    const response = await upload(uploadRequest(new File([readFileSync("samples/发票测试.png")], "test.png", { type: "image/png" })));
    expect(response.status).toBe(500);
    expect(uploads.removeImage).toHaveBeenCalledWith("storage/images/processed.png");
    expect(await state.prisma.task.count()).toBe(0);
    expect(afterWork).toHaveLength(0);
  });

  it("rejects damaged pixel data before creating files or tasks", async () => {
    const png = readFileSync("samples/发票测试.png").subarray(0, 60);
    const response = await upload(uploadRequest(new File([png], "broken.png", { type: "image/png" })));
    expect(response.status).toBe(400);
    expect(uploads.saveImage).not.toHaveBeenCalled();
    expect(await state.prisma.task.count()).toBe(0);
  });

  it("removes both images on deletion and supports legacy tasks", async () => {
    const t = await task({ originalImagePath: "storage/images/original.jpg" });
    expect((await deleteTask(new NextRequest("http://localhost"), context(t.id))).status).toBe(200);
    expect(uploads.removeImage).toHaveBeenCalledWith(t.imagePath);
    expect(uploads.removeImage).toHaveBeenCalledWith(t.originalImagePath);
    const legacy = await task();
    expect((await deleteTask(new NextRequest("http://localhost"), context(legacy.id))).status).toBe(200);
  });

  it("rejects malformed retry bodies and invalid options", async () => {
    const t = await task({ status: "failed" });
    for (const body of ["{", "null", "[]", '{"mode":"invalid"}', '{"precision":22}']) {
      expect((await retry(retryRequest(body), context(t.id))).status).toBe(400);
    }
    expect(afterWork).toHaveLength(0);
  });

  it("rejects retrying an active task without deleting its results", async () => {
    const t = await task({ status: "processing" });
    await state.prisma.rawResult.create({ data: { taskId: t.id, engine: "general", payload: "{}" } });
    expect((await retry(retryRequest(), context(t.id))).status).toBe(409);
    expect(await state.prisma.rawResult.count()).toBe(1);
    expect(afterWork).toHaveLength(0);
  });

  it("starts only one attempt under concurrent retries", async () => {
    const t = await task({ status: "failed" });
    const responses = await Promise.all([retry(retryRequest(), context(t.id)), retry(retryRequest(), context(t.id))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(afterWork).toHaveLength(1);
    const current = await state.prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(current.attemptId).not.toBe(t.attemptId);
    expect(current.status).toBe("pending");
  });
});
