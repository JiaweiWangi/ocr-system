import sharp from "sharp";
import { decode } from "bmp-js";
import { InputError, type ValidatedImage } from "./upload";
import { MAX_IMAGE_BYTES, MAX_INPUT_PIXELS, MAX_OCR_DIMENSION, MIN_IMAGE_DIMENSION } from "./uploadLimits";

const LOSSLESS_TARGET_BYTES = 2 * 1024 * 1024;

function decodeBmp(image: ValidatedImage) {
  const buffer = image.buffer;
  const unsupported = () => new InputError("BMP 编码不受支持，请重新导出为 PNG / JPG");
  if (buffer.length < 54 || buffer.readUInt32LE(14) !== 40 || buffer.readUInt32LE(30) !== 0 || buffer.readUInt16LE(26) !== 1) {
    throw unsupported();
  }
  const bits = buffer.readUInt16LE(28);
  if (![1, 4, 8, 24, 32].includes(bits)) throw unsupported();
  const paletteSize = bits < 16 ? buffer.readUInt32LE(46) || 2 ** bits : 0;
  if (paletteSize > 2 ** bits) throw unsupported();
  const paletteEnd = 54 + paletteSize * 4;
  const offset = buffer.readUInt32LE(10);
  const rowBytes = Math.ceil(image.width * bits / 32) * 4;
  if (offset < paletteEnd || offset + rowBytes * image.height > buffer.length) throw new InputError("BMP 像素数据不完整，请重新导出图片");
  // bmp-js reads pixels immediately after the palette; remove any valid padding gap.
  const normalized = offset === paletteEnd ? buffer : Buffer.concat([buffer.subarray(0, paletteEnd), buffer.subarray(offset)]);
  return decode(normalized);
}

export interface PreprocessingRecord {
  version: 1;
  original: { width: number; height: number; bytes: number; mime: string; orientation: number };
  output: { width: number; height: number; bytes: number; mime: string };
  operations: { autoOriented: boolean; resized: boolean; flattened: boolean; reencoded: true; jpegQuality: number | null };
}

export async function preprocessImage(image: ValidatedImage) {
  try {
    let source: ReturnType<typeof sharp>;
    if (image.mime === "image/bmp") {
      // bmp-js returns ABGR; sharp expects RGB. Ignore unused BMP alpha bytes.
      const bmp = decodeBmp(image);
      if (bmp.width !== image.width || bmp.height !== image.height) throw new Error("Invalid BMP dimensions");
      const rgb = Buffer.alloc(bmp.width * bmp.height * 3);
      for (let pixel = 0; pixel < bmp.width * bmp.height; pixel++) {
        rgb[pixel * 3] = bmp.data[pixel * 4 + 3];
        rgb[pixel * 3 + 1] = bmp.data[pixel * 4 + 2];
        rgb[pixel * 3 + 2] = bmp.data[pixel * 4 + 1];
      }
      source = sharp(rgb, { raw: { width: bmp.width, height: bmp.height, channels: 3 } });
    } else {
      source = sharp(image.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "warning" });
    }

    const metadata = await source.metadata();
    if ((metadata.pages ?? 1) > 1) throw new InputError("不支持多帧图片，请导出为单张 PNG 或 JPG");
    const orientation = metadata.orientation ?? 1;
    const pipeline = source.autoOrient().resize({
      width: MAX_OCR_DIMENSION, height: MAX_OCR_DIMENSION, fit: "inside", withoutEnlargement: true,
    }).flatten({ background: "#ffffff" }).toColourspace("srgb").timeout({ seconds: 15 });

    let jpegQuality: number | null = image.mime === "image/jpeg" ? 90 : null;
    let result = await (jpegQuality ? pipeline.clone().jpeg({ quality: jpegQuality, chromaSubsampling: "4:4:4" })
      : pipeline.clone().png()).toBuffer({ resolveWithObject: true });
    // Keep screenshots lossless when small; use moderate JPEG quality for large images.
    if (jpegQuality === null && result.data.length > LOSSLESS_TARGET_BYTES) {
      jpegQuality = 90;
      result = await pipeline.clone().jpeg({ quality: jpegQuality, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
    }
    for (const quality of [85, 80]) {
      if (result.data.length <= MAX_IMAGE_BYTES) break;
      jpegQuality = quality;
      result = await pipeline.clone().jpeg({ quality, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
    }
    if (result.data.length > MAX_IMAGE_BYTES) throw new InputError("预处理后图片仍超过 6 MiB，请裁剪或缩小后重试", 413);
    if (Math.min(result.info.width, result.info.height) < MIN_IMAGE_DIMENSION) {
      throw new InputError("图片长宽比例过大，缩放后短边不足 15 像素，请裁剪后重试");
    }
    const mime = result.info.format === "jpeg" ? "image/jpeg" : "image/png";
    const rotated = orientation >= 5 && orientation <= 8;
    const record: PreprocessingRecord = {
      version: 1,
      original: { width: image.width, height: image.height, bytes: image.buffer.length, mime: image.mime, orientation },
      output: { width: result.info.width, height: result.info.height, bytes: result.data.length, mime },
      operations: {
        autoOriented: orientation !== 1,
        resized: result.info.width !== (rotated ? image.height : image.width) || result.info.height !== (rotated ? image.width : image.height),
        flattened: metadata.hasAlpha ?? false, reencoded: true, jpegQuality,
      },
    };
    return { buffer: result.data, width: result.info.width, height: result.info.height, mime, record };
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("图片解码或预处理失败，请检查文件是否损坏，或重新导出为 PNG / JPG");
  }
}
