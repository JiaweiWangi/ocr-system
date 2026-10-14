import type {
  TableV2Result,
  TableV2Table,
  TableV2TextCell,
} from "../baidu/table";
import { polygonToBbox } from "../baidu/table";
import type { GeneralResult } from "../baidu/general";
import { blockId, type Block, type OcrDocument, type TableCell } from "./types";
import { dimsFromCells } from "./tableMath";
import { fromGeneral } from "./fromGeneral";

/**
 * table V2 响应（可附带 general 抓表外文字）→ OcrDocument
 *
 * - body/footer 单元格直接映射（网格线编号语义一致）
 * - header 单元格【无网格编号】（真实接口只给像素四角 location）：
 *   按 body 各列的像素范围对齐到网格，行号取 0
 * - 若附带 general 结果：用 table_location 外包矩形剔除落在表格内部的文本行
 */

interface BboxLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function cellCenter(poly: { x: number; y: number }[] | undefined): { x: number; y: number } | null {
  if (!poly || poly.length === 0) return null;
  const b = polygonToBbox(poly);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

function inside(bbox: BboxLike, host: BboxLike): boolean {
  const cx = bbox.left + bbox.width / 2;
  const cy = bbox.top + bbox.height / 2;
  return (
    cx >= host.left && cx <= host.left + host.width && cy >= host.top && cy <= host.top + host.height
  );
}

/**
 * 百度网格线编号 → 含两端格子下标。
 * 真实响应中单格的 col_end = col_start + 1（跨线 i→i+1），
 * 本系统 TableCell 语义是含两端下标（单格 start == end）。
 * 兼容两种返回：end > start 视为网格线语义（减 1），相等视为下标语义（保留）。
 */
function gridToCell(start: number, end: number): { start: number; end: number } {
  return end > start ? { start, end: end - 1 } : { start, end };
}

/**
 * header 单元格（仅像素位置）→ 网格坐标：
 * 用 body 各列 cell_location 的 x 范围推断列边界，header 中心点落在哪个区间就归哪列。
 * header 通常只有一行的部分单元格（其余为空），行号统一为 0。
 */
function alignHeader(
  header: TableV2TextCell[],
  body: NonNullable<TableV2Table["body"]>,
): TableCell[] {
  if (header.length === 0 || body.length === 0) return [];

  // 收集 body 每列的 x 范围（用转换后的格子下标：跨列格记到其起始列）
  const colRanges = new Map<number, { min: number; max: number }>();
  for (const c of body) {
    const center = cellCenter(c.cell_location);
    if (!center) continue;
    const col = gridToCell(c.col_start, c.col_end).start;
    const r = colRanges.get(col);
    if (!r) colRanges.set(col, { min: center.x, max: center.x });
    else {
      r.min = Math.min(r.min, center.x);
      r.max = Math.max(r.max, center.x);
    }
  }
  if (colRanges.size === 0) return [];

  const cols = [...colRanges.keys()].sort((a, b) => a - b);

  const cells: TableCell[] = [];
  for (const h of header) {
    if (!h.words?.trim()) continue;
    const center = cellCenter(h.location) ?? cellCenter((h as unknown as { cell_location?: { x: number; y: number }[] }).cell_location);
    if (!center) continue;
    // 找中心点 x 最近均值点的列
    let bestCol = cols[0];
    let bestDist = Infinity;
    for (const col of cols) {
      const r = colRanges.get(col)!;
      const mid = (r.min + r.max) / 2;
      const dist = Math.abs(center.x - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
      }
    }
    cells.push({
      rowStart: 0,
      rowEnd: 0,
      colStart: bestCol,
      colEnd: bestCol,
      text: h.words,
    });
  }
  return cells;
}

export function fromTable(
  tableResult: TableV2Result,
  image: OcrDocument["image"],
  generalResult?: GeneralResult,
): OcrDocument {
  const blocks: Block[] = [];
  const tableBboxes: BboxLike[] = [];

  for (const table of tableResult.tables_result ?? []) {
    const bodyCells: TableCell[] = (table.body ?? []).map((c) => {
      const row = gridToCell(c.row_start, c.row_end);
      const col = gridToCell(c.col_start, c.col_end);
      return {
        rowStart: row.start,
        rowEnd: row.end,
        colStart: col.start,
        colEnd: col.end,
        text: c.words ?? "",
      };
    });
    const headerCells = alignHeader(table.header ?? [], table.body ?? []);

    const allCells = [...headerCells, ...bodyCells];
    if (allCells.length === 0) continue;

    const { rows, cols } = dimsFromCells(allCells);

    const bbox = table.table_location
      ? polygonToBbox(table.table_location)
      : bboxFromCells();
    tableBboxes.push(bbox);

    // header/footer 的像素位置可能在 table_location 之外（实测 header 行在边框上方），
    // 单独纳入排除区，避免表头/表尾文字泄漏成段落
    for (const h of table.header ?? []) {
      if (h.location) tableBboxes.push(polygonToBbox(h.location));
    }
    for (const f of table.footer ?? []) {
      if (f.location) tableBboxes.push(polygonToBbox(f.location));
    }

    blocks.push({
      id: blockId(),
      type: "table",
      bbox,
      source: "table",
      table: { rows, cols, cells: allCells },
    });

    // 表尾是按行拆分的文字（同 header 形态，无网格坐标），作为表格下方的段落块
    for (const f of table.footer ?? []) {
      if (!f.words?.trim()) continue;
      const fb = f.location ? polygonToBbox(f.location) : bboxFromCells();
      blocks.push({
        id: blockId(),
        type: "paragraph",
        text: f.words,
        bbox: fb,
        source: "table",
      });
    }
  }

  // 附带的 general 文本：剔除表内行后归一化为段落
  if (generalResult && (generalResult.words_result?.length ?? 0) > 0) {
    const outside: GeneralResult = {
      ...generalResult,
      words_result: generalResult.words_result.filter(
        (w) => !tableBboxes.some((tb) => inside(w.location, tb)),
      ),
    };
    if (outside.words_result.length > 0) {
      const doc = fromGeneral(outside, image, "general");
      blocks.push(...doc.blocks);
    }
  }

  return { schemaVersion: 1, image, blocks };
}

/** 无 table_location 时：网格编号不是像素坐标，bbox 置零（前端按无高亮处理） */
function bboxFromCells(): BboxLike {
  return { left: 0, top: 0, width: 0, height: 0 };
}
