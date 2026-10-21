import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./http";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("upstream requests", () => {
  it("aborts a stalled request at its deadline", async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => { aborted = true; reject(init.signal.reason); });
    })));
    const assertion = expect(requestJson("https://example.test", {}, "OCR", undefined, 30)).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(aborted).toBe(true);
  });

  it("also times out when headers arrive but the response body stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({
      ok: true,
      json: () => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
    })));
    const assertion = expect(requestJson("https://example.test", {}, "下载", undefined, 20)).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });

  it("propagates task cancellation and does not send an already cancelled request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort(new Error("task deadline"));
    await expect(requestJson("https://example.test", {}, "OCR", controller.signal)).rejects.toThrow("task deadline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports HTTP and invalid JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response("not JSON")));
    await expect(requestJson("https://example.test", {}, "OCR")).rejects.toThrow("HTTP 502");
    await expect(requestJson("https://example.test", {}, "OCR")).rejects.toThrow("无效的 JSON");
  });

  it("does not leak URLs or credentials in network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("https://example.test?access_token=SECRET")));
    await expect(requestJson("https://example.test?access_token=SECRET", {}, "OCR")).rejects.toThrow("网络连接失败");
    await expect(requestJson("https://example.test?access_token=SECRET", {}, "OCR")).rejects.not.toThrow("SECRET");
  });
});
