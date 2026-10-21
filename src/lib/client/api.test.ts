import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./api";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("browser API requests", () => {
  it("reports server errors and malformed success bodies", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "任务正在处理中" }, { status: 409 }))
      .mockResolvedValueOnce(new Response("<html>proxy error</html>")));
    await expect(fetchJson("/api/tasks")).rejects.toThrow("任务正在处理中");
    await expect(fetchJson("/api/tasks")).rejects.toThrow("数据无效");
  });

  it("aborts stalled requests and identifies timeout errors for the upload UI", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    })));
    const assertion = expect(fetchJson("/api/tasks")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors caller cancellation and clears its timeout", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    })));
    const assertion = expect(fetchJson("/api/tasks", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
