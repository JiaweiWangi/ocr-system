export const REQUEST_TIMEOUT_MS = 30_000;

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** Keep the deadline active until the response body has also been consumed. */
export async function requestJson(
  url: string,
  init: RequestInit,
  label: string,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    combined.throwIfAborted();
    const response = await fetch(url, { ...init, signal: combined });
    if (!response.ok) throw new UpstreamError(`${label}失败（HTTP ${response.status}），请稍后重试`);
    try {
      return await response.json();
    } catch (error) {
      if (combined.aborted) throw error;
      throw new UpstreamError(`${label}返回了无效的 JSON 数据，请稍后重试`);
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (controller.signal.aborted) throw new UpstreamError(`${label}超时，请重试`);
    if (error instanceof UpstreamError) throw error;
    // Do not include fetch errors or URLs: they can contain credentials and tokens.
    throw new UpstreamError(`${label}网络连接失败，请稍后重试`);
  } finally {
    clearTimeout(timer);
  }
}
