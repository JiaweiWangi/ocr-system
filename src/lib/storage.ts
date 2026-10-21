import fs from "node:fs/promises";
import path from "node:path";
import { imageSize as readImageSize } from "image-size";

/**
 * 图片落盘存储：storage/images/{taskId}{ext}
 * imagePath 存相对路径（storage/images/xxx），读取时拼接项目根。
 */

const STORAGE_DIR = path.join(process.cwd(), "storage", "images");

export async function saveImage(taskId: string, file: File, buffer?: Buffer): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const ext = extFromMime(file.type) ?? extFromName(file.name) ?? ".jpg";
  const rel = `storage/images/${taskId}${ext}`;
  const buf = buffer ?? Buffer.from(await file.arrayBuffer());
  try {
    await fs.writeFile(path.join(process.cwd(), rel), buf);
  } catch (error) {
    await removeImage(rel).catch(() => undefined);
    throw error;
  }
  return rel;
}

export function resolveImagePath(rel: string): string {
  return path.join(process.cwd(), rel);
}

export async function removeImage(rel: string): Promise<void> {
  await fs.rm(resolveImagePath(rel), { force: true });
}

function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
  };
  return map[mime] ?? null;
}

function extFromName(name: string): string | null {
  const m = name.match(/\.(jpe?g|png|webp|bmp)$/i);
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : null;
}

export async function imageToBase64(rel: string): Promise<string> {
  const buf = await fs.readFile(resolveImagePath(rel));
  return buf.toString("base64");
}

/** Use the same parser for every accepted format, including BMP and WebP. */
export async function imageSize(rel: string): Promise<{ width: number; height: number } | null> {
  const buf = await fs.readFile(resolveImagePath(rel));
  try {
    const size = readImageSize(buf);
    return size.width && size.height ? { width: size.width, height: size.height } : null;
  } catch {
    return null;
  }
}
