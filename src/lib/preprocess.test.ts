import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { encode } from "bmp-js";
import { randomBytes } from "node:crypto";
import { validateImage } from "./upload";
import { preprocessImage } from "./preprocess";
import { MAX_IMAGE_BYTES } from "./uploadLimits";

async function process(buffer: Buffer, mime = "image/png") {
  return preprocessImage(await validateImage(new File([new Uint8Array(buffer)], "test", { type: mime })));
}

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#ff0000" } });

describe("image preprocessing", () => {
  it("corrects EXIF rotation and removes orientation metadata", async () => {
    const image = await solid(80, 40).composite([{
      input: await sharp({ create: { width: 40, height: 40, channels: 3, background: "#0000ff" } }).png().toBuffer(),
      left: 40, top: 0,
    }]).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await process(image, "image/jpeg");
    expect([result.width, result.height]).toEqual([40, 80]);
    expect(result.record.operations).toMatchObject({ autoOriented: true, resized: false });
    expect((await sharp(result.buffer).metadata()).orientation).toBeUndefined();
    const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[(info.height - 1) * info.width * 3 + 2]).toBeGreaterThan(200);
  });

  it("handles mirrored EXIF orientation", async () => {
    const image = await solid(80, 40).composite([{
      input: await sharp({ create: { width: 40, height: 40, channels: 3, background: "#0000ff" } }).png().toBuffer(),
      left: 40, top: 0,
    }]).jpeg().withMetadata({ orientation: 2 }).toBuffer();
    const result = await process(image, "image/jpeg");
    const pixels = await sharp(result.buffer).raw().toBuffer();
    expect(pixels[2]).toBeGreaterThan(200);
    expect([result.width, result.height]).toEqual([80, 40]);
  });

  it("shrinks large images proportionally and records the final coordinate space", async () => {
    const result = await process(await solid(5000, 2500).png().toBuffer());
    expect([result.width, result.height]).toEqual([4096, 2048]);
    expect(result.record.original).toMatchObject({ width: 5000, height: 2500 });
    expect(result.record.output).toMatchObject({ width: 4096, height: 2048, bytes: result.buffer.length });
    expect(result.record.operations.resized).toBe(true);
  });

  it("keeps small screenshots lossless without enlarging them", async () => {
    const image = await solid(80, 40).png().toBuffer();
    const result = await process(image);
    expect([result.width, result.height, result.mime]).toEqual([80, 40, "image/png"]);
    expect(result.record.operations).toMatchObject({ resized: false, jpegQuality: null });
    expect(await sharp(result.buffer).raw().toBuffer()).toEqual(await sharp(image).raw().toBuffer());
  });

  it("flattens transparent pixels onto white", async () => {
    const input = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const result = await process(input);
    expect(result.record.operations.flattened).toBe(true);
    expect((await sharp(result.buffer).raw().toBuffer()).subarray(0, 3)).toEqual(Buffer.from([255, 255, 255]));
  });

  it("converts BMP and WebP to an OCR-compatible PNG with correct colours", async () => {
    const abgr = Buffer.alloc(20 * 20 * 4);
    for (let i = 0; i < abgr.length; i += 4) abgr[i + 3] = 255;
    const bmp = encode({ data: abgr, width: 20, height: 20 }).data;
    const webp = await solid(20, 20).webp({ lossless: true }).toBuffer();
    for (const [buffer, mime] of [[bmp, "image/bmp"], [webp, "image/webp"]] as const) {
      const result = await process(buffer, mime);
      expect(result.mime).toBe("image/png");
      expect([result.width, result.height]).toEqual([20, 20]);
      expect((await sharp(result.buffer).raw().toBuffer()).subarray(0, 3)).toEqual(Buffer.from([255, 0, 0]));
    }
    await expect(process(bmp.subarray(0, 60), "image/bmp")).rejects.toThrow("数据不完整");
  });

  it("compresses large lossless input without changing dimensions", async () => {
    const image = await sharp(randomBytes(1000 * 1000 * 3), { raw: { width: 1000, height: 1000, channels: 3 } }).png().toBuffer();
    const result = await process(image);
    expect(result.mime).toBe("image/jpeg");
    expect(result.buffer.length).toBeLessThan(image.length);
    expect(result.buffer.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(result.record.operations.jpegQuality).toBe(90);
    expect([result.width, result.height]).toEqual([1000, 1000]);
  });

  it("rejects corrupt pixel payloads even when the header is readable", async () => {
    const png = await solid(100, 100).png().toBuffer();
    await expect(process(png.subarray(0, 60))).rejects.toThrow("解码或预处理失败");
  });

  it("rejects animated WebP instead of silently recognizing only the first frame", async () => {
    const frames = Buffer.concat([Buffer.alloc(20 * 20 * 3, 255), Buffer.alloc(20 * 20 * 3, 0)]);
    const animated = await sharp(frames, { raw: { width: 20, height: 40, channels: 3, pageHeight: 20 } }).webp({ lossless: true }).toBuffer();
    await expect(process(animated, "image/webp")).rejects.toThrow("多帧图片");
  });

  it("rejects extreme aspect ratios that would become unreadably narrow", async () => {
    await expect(process(await solid(10000, 15).png().toBuffer())).rejects.toThrow("短边不足 15");
  });
});
