import fs from "node:fs/promises";
import path from "node:path";

/**
 * 图片落盘存储：storage/images/{taskId}{ext}
 * imagePath 存相对路径（storage/images/xxx），读取时拼接项目根。
 */

const STORAGE_DIR = path.join(process.cwd(), "storage", "images");

export async function saveImage(taskId: string, file: File): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const ext = extFromMime(file.type) ?? extFromName(file.name) ?? ".jpg";
  const rel = `storage/images/${taskId}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(process.cwd(), rel), buf);
  return rel;
}

export function resolveImagePath(rel: string): string {
  return path.join(process.cwd(), rel);
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

/** 读取图片尺寸（PNG/JPEG 简单解析，避免引入原生依赖） */
export async function imageSize(rel: string): Promise<{ width: number; height: number } | null> {
  const buf = await fs.readFile(resolveImagePath(rel));

  // PNG: IHDR 在固定偏移
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: 遍历 SOF 段
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      // SOF0-SOF15（除 DHT/JPG/DAC）
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const len = buf.readUInt16BE(off + 2);
      off += 2 + len;
    }
  }

  return null;
}
