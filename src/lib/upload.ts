import { imageSize } from "image-size";
import { MAX_IMAGE_BYTES, IMAGE_MIME_TYPES } from "./uploadLimits";

export class InputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function recognitionOptions(mode: unknown, precision: unknown) {
  if (mode !== undefined && mode !== null && !["general", "table", "deep"].includes(mode as string)) {
    throw new InputError("无效的识别模式");
  }
  if (precision !== undefined && precision !== null && !["standard", "high"].includes(precision as string)) {
    throw new InputError("无效的识别精度");
  }
  return { mode: (mode ?? "general") as string, precision: (precision ?? "standard") as string };
}

export async function validateImage(file: File) {
  if (!file.size) throw new InputError("图片不能为空");
  if (file.size > MAX_IMAGE_BYTES) throw new InputError("图片过大（>6MB），请压缩后重试", 413);
  if (!IMAGE_MIME_TYPES.includes(file.type)) throw new InputError("仅支持 PNG / JPG / BMP / WebP 图片", 415);
  const buffer = Buffer.from(await file.arrayBuffer());
  let info;
  try {
    info = imageSize(buffer);
  } catch {
    throw new InputError("无法读取图片，请检查文件是否损坏");
  }
  const mime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", bmp: "image/bmp", webp: "image/webp" };
  if (!info.type || mime[info.type] !== file.type) throw new InputError("图片实际格式与声明不符，请重新导出为 PNG 或 JPG");
  if (!info.width || !info.height || Math.min(info.width, info.height) < 15 || Math.max(info.width, info.height) > 4096) {
    throw new InputError("图片每边须为 15–4096 像素，请调整尺寸后重试");
  }
  return { buffer, width: info.width, height: info.height };
}

/** Bound the multipart body before parsing, including requests without Content-Length. */
export async function readUploadForm(req: Request): Promise<FormData> {
  const maxBytes = MAX_IMAGE_BYTES + 64 * 1024;
  const length = req.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new InputError("上传内容过大", 413);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    throw new InputError("请使用 multipart/form-data 上传图片", 415);
  }
  if (!req.body) throw new InputError("缺少上传内容");
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new InputError("上传超时，请重试", 408));
      void reader.cancel().catch(() => undefined);
    }, 30_000);
    timer.unref?.();
  });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new InputError("上传内容过大", 413);
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("上传内容无效，请重新选择图片");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
