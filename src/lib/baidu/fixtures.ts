import fs from "node:fs/promises";
import path from "node:path";

/**
 * fixtures 回放机制：BAIDU_MOCK=1 时读 fixtures/ 目录的录制响应，不真实调用百度。
 * 开发/测试的默认模式，节省免费额度。
 *
 * 查找顺序：fixtures/{engine}-{imageKey}.json → fixtures/{engine}-default.json
 * imageKey 来自上传文件名（去扩展名、小写），配合 samples/ 样张按版式回放。
 */

const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

export function isMockMode(): boolean {
  return process.env.BAIDU_MOCK === "1";
}

/** 从上传文件名提取 fixture key：发票.png → 发票 / receipt-01.jpg → receipt-01 */
export function imageKeyFromName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").toLowerCase();
}

export async function loadFixture(engine: string, imageKey: string): Promise<unknown> {
  const candidates = [
    path.join(FIXTURES_DIR, `${engine}-${imageKey}.json`),
    path.join(FIXTURES_DIR, `${engine}-default.json`),
  ];
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf-8");
      return JSON.parse(raw);
    } catch {
      // 尝试下一个
    }
  }
  throw new Error(
    `Mock 模式下未找到 fixture：fixtures/${engine}-${imageKey}.json 或 ${engine}-default.json`,
  );
}

/** 深度模式 mock：模拟异步任务生命周期（内存计数器，每次查询推进状态） */
const mockProgress = new Map<string, number>();

export function mockParserSubmit(): string {
  const taskId = `mock_${Date.now().toString(36)}`;
  mockProgress.set(taskId, 0);
  return taskId;
}

export function mockParserQuery(taskId: string): {
  ret_code: number;
  task_id: string;
} {
  const count = (mockProgress.get(taskId) ?? 0) + 1;
  mockProgress.set(taskId, count);
  // 第 1 次查询排队中，第 2 次处理中，第 3 次起完成 —— 让前端轮询有真实感
  const ret_code = count >= 3 ? 3 : count;
  return { ret_code, task_id: taskId };
}
