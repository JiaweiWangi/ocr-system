import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readUploadForm, recognitionOptions, validateImage } from "./upload";
import { MAX_IMAGE_BYTES } from "./uploadLimits";

const png = readFileSync("samples/发票测试.png");
afterEach(() => vi.useRealTimers());

describe("upload validation", () => {
  it("accepts a genuine PNG and rejects MIME spoofing", async () => {
    const image = await validateImage(new File([png], "image.png", { type: "image/png" }));
    expect(image.width).toBeGreaterThan(15);
    await expect(validateImage(new File([png], "fake.jpg", { type: "image/jpeg" }))).rejects.toThrow("实际格式");
  });

  it("reads BMP and WebP dimensions as well as PNG/JPEG", async () => {
    const samples = [
      ["bmp", "Qk2OAAAAAAAAAD4AAAAoAAAAFAAAABQAAAABAAEAAAAAAFAAAADEDgAAxA4AAAIAAAACAAAAAAAAAP///wD///AA///wAP//8AD///AA///wAP//8AD///AA///wAP//8AD///AA///wAP//8AD///AA///wAP//8AD///AA///wAP//8AD///AA///wAA=="],
      ["webp", "UklGRjIAAABXRUJQVlA4ICYAAADQAgCdASoUABQAPm00lkekIyIhKAgAgA2JaQAAPaOgAP77IYAAAA=="],
    ];
    for (const [format, base64] of samples) {
      const result = await validateImage(new File([Buffer.from(base64, "base64")], `test.${format}`, { type: `image/${format}` }));
      expect({ width: result.width, height: result.height }).toEqual({ width: 20, height: 20 });
    }
    const jpeg = readFileSync("samples/dataset/images/scan/scan-01-challenge.jpg");
    expect((await validateImage(new File([jpeg], "test.jpg", { type: "image/jpeg" }))).width).toBeGreaterThan(15);
  });

  it("rejects empty, oversized, unsupported and unreadable files", async () => {
    await expect(validateImage(new File([], "empty.png", { type: "image/png" }))).rejects.toThrow("不能为空");
    await expect(validateImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }))).rejects.toMatchObject({ status: 413 });
    await expect(validateImage(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }))).rejects.toMatchObject({ status: 415 });
    await expect(validateImage(new File(["not an image"], "fake.png", { type: "image/png" }))).rejects.toThrow("无法读取");
  });

  it("allows resizeable images but rejects tiny images and excessive decoded pixel counts", async () => {
    const large = Buffer.from(png);
    large.writeUInt32BE(5000, 16);
    expect((await validateImage(new File([large], "large.png", { type: "image/png" }))).width).toBe(5000);
    large.writeUInt32BE(10, 16);
    await expect(validateImage(new File([large], "tiny.png", { type: "image/png" }))).rejects.toThrow("至少需要 15");
    large.writeUInt32BE(6000, 16);
    large.writeUInt32BE(6000, 20);
    await expect(validateImage(new File([large], "huge.png", { type: "image/png" }))).rejects.toThrow("3200 万");
    large.writeUInt32BE(17000, 16);
    large.writeUInt32BE(20, 20);
    await expect(validateImage(new File([large], "wide.png", { type: "image/png" }))).rejects.toThrow("16384");
  });

  it("validates recognition parameters rather than silently falling back", () => {
    expect(recognitionOptions(null, null)).toEqual({ mode: "general", precision: "standard" });
    expect(() => recognitionOptions("invalid", "high")).toThrow("模式");
    expect(() => recognitionOptions("general", new File([], "x"))).toThrow("精度");
  });

  it("parses a bounded multipart upload", async () => {
    const form = new FormData();
    form.set("image", new File([png], "image.png", { type: "image/png" }));
    const result = await readUploadForm(new Request("http://localhost/api/tasks", { method: "POST", body: form }));
    expect((result.get("image") as File).size).toBe(png.byteLength);
  });

  it("bounds chunked bodies even without Content-Length", async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 64 * 1024 + 1));
      controller.close();
    } });
    const req = new Request("http://localhost", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body, duplex: "half",
    } as RequestInit);
    await expect(readUploadForm(req)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed multipart and stops stalled uploads", async () => {
    await expect(readUploadForm(new Request("http://localhost", { method: "POST", body: "bad" }))).rejects.toMatchObject({ status: 415 });
    vi.useFakeTimers();
    const req = new Request("http://localhost", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" },
      body: new ReadableStream(), duplex: "half",
    } as RequestInit);
    const assertion = expect(readUploadForm(req)).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
