/**
 * 前端图片预处理（canvas，避免服务端 sharp 原生依赖）：
 * - EXIF 旋转修正（拍照件的关键步骤）
 * - 长边 > 4096 缩放（百度接口限制）
 * - 质量压缩至 ≤ 4MB
 *
 * detect_direction=true 交给百度处理文字朝向，这里只处理图片本身的旋转。
 */

const MAX_EDGE = 4096;
const TARGET_BYTES = 4 * 1024 * 1024;

export async function preprocessImage(file: File): Promise<File> {
  // 非 JPEG 的 PNG/WebP/BMP 无 EXIF 旋转问题，只做尺寸/大小处理
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  try {
    const orientation = file.type === "image/jpeg" ? await readExifOrientation(file) : 1;

    // 旋转后的实际宽高
    const swap = orientation >= 5 && orientation <= 8;
    const srcW = swap ? bitmap.height : bitmap.width;
    const srcH = swap ? bitmap.width : bitmap.height;

    // 缩放
    const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // EXIF 变换
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, dstW, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, dstW, dstH); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, dstH); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); ctx.scale(dstH / bitmap.width, dstW / bitmap.height); break;
      case 6: ctx.transform(0, 1, -1, 0, dstW, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, dstH, dstW); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, 0); ctx.scale(dstH / bitmap.width, dstW / bitmap.height); break;
    }

    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, dstW, dstH);

    // 压缩（二分质量，直到 ≤ 4MB 或质量下限）
    let blob = await toJpeg(canvas, 0.85);
    let quality = 0.85;
    while (blob.size > TARGET_BYTES && quality > 0.4) {
      quality -= 0.15;
      blob = await toJpeg(canvas, quality);
    }

    // 已经足够小且无需变换时直接返回原文件
    const unchanged =
      orientation === 1 && scale === 1 && blob.size >= file.size;
    if (unchanged) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob 失败"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 读 JPEG EXIF Orientation（1-8），非 JPEG 或无 EXIF 返回 1 */
async function readExifOrientation(file: File): Promise<number> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

    let off = 2;
    while (off + 4 < view.byteLength) {
      const marker = view.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) break;
      const size = view.getUint16(off + 2);

      // APP1 = Exif
      if (marker === 0xffe1 && off + 4 + 6 <= view.byteLength) {
        const tag = String.fromCharCode(
          view.getUint8(off + 4), view.getUint8(off + 5),
          view.getUint8(off + 6), view.getUint8(off + 7),
        );
        if (tag === "Exif") {
          return parseExifOrientation(view, off + 10, off + 2 + size);
        }
      }
      off += 2 + size;
    }
  } catch {
    // 任何解析失败按无旋转处理
  }
  return 1;
}

function parseExifOrientation(view: DataView, tiffStart: number, end: number): number {
  const little = view.getUint16(tiffStart) === 0x4949;
  const u16 = (p: number) => view.getUint16(p, little);
  const u32 = (p: number) => view.getUint32(p, little);

  if (u16(tiffStart + 2) !== 0x2a00 && u16(tiffStart + 2) !== 0x002a) return 1;
  const ifdOffset = u32(tiffStart + 4);
  const dirStart = tiffStart + ifdOffset;
  if (dirStart + 2 > end) return 1;

  const entries = u16(dirStart);
  for (let i = 0; i < entries; i++) {
    const entry = dirStart + 2 + i * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) {
      return u16(entry + 8);
    }
  }
  return 1;
}
