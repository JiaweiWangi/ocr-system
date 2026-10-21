import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOcrApi } from "./client";
import { clearTokenCache, getAccessToken } from "./token";

vi.mock("./token", async (original) => ({
  ...await original<object>(), getAccessToken: vi.fn(), clearTokenCache: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue("test-token");
});
afterEach(() => vi.unstubAllGlobals());

describe("OCR retry policy", () => {
  it("does not retry exhausted quota or ambiguous network failures", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error_code: 17, error_msg: "quota" }))
      .mockRejectedValueOnce(new Error("connection lost"));
    vi.stubGlobal("fetch", fetch);
    await expect(callOcrApi("/ocr", {})).rejects.toMatchObject({ code: 17 });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(callOcrApi("/ocr", {})).rejects.toThrow("网络连接失败");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes an invalid token once and then succeeds", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error_code: 110 }))
      .mockResolvedValueOnce(Response.json({ words_result: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(callOcrApi("/ocr", {})).resolves.toEqual({ words_result: [] });
    expect(clearTokenCache).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after a bounded number of explicit QPS retries", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ error_code: 18 }));
    vi.stubGlobal("fetch", fetch);
    await expect(callOcrApi("/ocr", {})).rejects.toMatchObject({ code: 18 });
    expect(fetch).toHaveBeenCalledTimes(4);
  }, 10_000);

  it("does not send an already-cancelled queued request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(callOcrApi("/ocr", {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
