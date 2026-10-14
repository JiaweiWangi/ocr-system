import type { GeneralResult } from "../baidu/general";
import { blockId, type Block, type OcrDocument, type Bbox } from "./types";

/**
 * general/accurate 响应 → OcrDocument
 *
 * 优先使用 paragraph=true 返回的段落分组（paragraphs_result.words_result_idx），
 * 把每段的行 words join 成一个段落块，bbox 取组内行的外包矩形；
 * 无段落信息时按行间距阈值兜底分组。
 */

function unionBbox(boxes: Bbox[]): Bbox {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** 行间距兜底分组：行高 1.5 倍以上的间隙视为分段 */
function groupByGap<T extends { location: Bbox }>(words: T[]): T[][] {
  if (words.length === 0) return [];
  const groups: T[][] = [[words[0]]];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1].location;
    const cur = words[i].location;
    const prevBottom = prev.top + prev.height;
    const gap = cur.top - prevBottom;
    if (gap > prev.height * 1.5) groups.push([words[i]]);
    else groups[groups.length - 1].push(words[i]);
  }
  return groups;
}

export function fromGeneral(
  result: GeneralResult,
  image: OcrDocument["image"],
  source: "general" | "accurate" = "general",
): OcrDocument {
  const words = result.words_result ?? [];
  const blocks: Block[] = [];

  const groups: (typeof words)[] =
    result.paragraphs_result && result.paragraphs_result.length > 0
      ? result.paragraphs_result.map(
          (p) => p.words_result_idx.filter((i) => words[i]).map((i) => words[i]),
        )
      : groupByGap(words);

  for (const group of groups) {
    if (group.length === 0) continue;
    const text = group.map((w) => w.words).join("");
    const bbox = unionBbox(group.map((w) => w.location));
    const confidences = group
      .map((w) => w.probability?.average)
      .filter((v): v is number => typeof v === "number");
    blocks.push({
      id: blockId(),
      type: "paragraph",
      text,
      bbox,
      source,
      ...(confidences.length
        ? { confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length }
        : {}),
    });
  }

  return { schemaVersion: 1, image, blocks };
}
