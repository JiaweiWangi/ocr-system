import { getAccessToken, isTokenInvalidError, clearTokenCache } from "./token";

/**
 * 百度 OCR API 统一调用封装
 *
 * - 全局串行队列：免费档 QPS=2，串行 + 最小间隔保证不被限流
 * - 错误码 17（额度超限）/18（QPS 超限）指数退避重试
 * - 错误码 110/111（token 失效）强刷 token 后重试一次
 */

const MIN_INTERVAL_MS = 600; // 串行间隔，保守控制在 QPS=2 以内
const MAX_RETRIES = 3;

export class BaiduApiError extends Error {
  code: number;
  logId?: number;
  constructor(code: number, message: string, logId?: number) {
    super(`百度 API 错误 ${code}: ${message}${logId ? ` (log_id: ${logId})` : ""}`);
    this.name = "BaiduApiError";
    this.code = code;
    this.logId = logId;
  }
}

// ---- 全局串行队列 ----

let queueTail: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run.then(job);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BaiduResponse {
  error_code?: number;
  error_msg?: string;
  log_id?: number;
  [key: string]: unknown;
}

/**
 * 调用一个百度 OCR REST 接口。
 * @param path 例如 /rest/2.0/ocr/v1/general
 * @param params 业务参数（不含 access_token）
 */
export async function callOcrApi(
  path: string,
  params: Record<string, string>,
): Promise<BaiduResponse> {
  const url = (token: string) =>
    `https://aip.baidubce.com${path}?access_token=${encodeURIComponent(token)}`;

  return enqueue(async () => {
    let tokenRefreshed = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const token = await getAccessToken();
      const body = new URLSearchParams({ access_token: token, ...params });

      const res = await fetch(url(token), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const data = (await res.json()) as BaiduResponse;

      if (data.error_code === undefined) return data;

      // token 失效：强刷一次重试
      if (isTokenInvalidError(data.error_code) && !tokenRefreshed) {
        clearTokenCache();
        tokenRefreshed = true;
        continue;
      }

      // 额度/QPS 超限：指数退避重试
      if (
        (data.error_code === 17 || data.error_code === 18) &&
        attempt < MAX_RETRIES
      ) {
        await sleep(500 * 2 ** attempt);
        continue;
      }

      throw new BaiduApiError(data.error_code, data.error_msg ?? "未知错误", data.log_id);
    }

    throw new BaiduApiError(-1, "重试次数耗尽");
  });
}
