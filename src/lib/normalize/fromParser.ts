import { blockId, type Block, type OcrDocument, type TableCell } from "./types";
import { dimsFromCells } from "./tableMath";

/**
 * 文档解析 parse_result → OcrDocument（承担版面分析）
 *
 * 真实 API 的 parse_result 结构（v2 parser）：
 * - pages[].layouts[]: { layout_id, type, sub_type?, position: [l,t,w,h], text }
 *   type: text / title / table / image / seal / formula / header / footer 等
 *   sub_type: doc_title / title{n} / wired_table / wireless_table 等
 * - pages[].tables[]: { layout_id, markdown, cells[], matrix }
 *   cells[i]: { layout_id, text, position }（无行列坐标）
 *   matrix[r][c] = cells 数组索引，行主序；重复索引 = 合并单元格
 *   表格与布局块经 layout_id 直接配对
 *
 * 旧版手写 fixture（row_start/col_start/words + bbox）仍兼容。
 */

interface ParserLayoutRaw {
  layout_id?: string;
  type?: string;
  sub_type?: string;
  bbox?: number[]; // 旧格式
  position?: number[]; // 真实 API：[left, top, width, height]
  text?: string;
}

interface ParserCellRaw {
  text?: string;
  words?: string; // 旧 fixture 格式
  row_start?: number;
  row_end?: number;
  col_start?: number;
  col_end?: number;
}

interface ParserTableRaw {
  layout_id?: string;
  cells?: unknown[];
  matrix?: unknown[][];
}

interface ParserPageRaw {
  layouts?: ParserLayoutRaw[];
  tables?: unknown[];
  [key: string]: unknown;
}

interface ParseResultRaw {
  pages?: ParserPageRaw[];
  [key: string]: unknown;
}

function toBbox(raw: number[] | undefined): Block["bbox"] {
  if (!raw || raw.length < 4) return { left: 0, top: 0, width: 0, height: 0 };
  return { left: raw[0], top: raw[1], width: raw[2], height: raw[3] };
}

const TYPE_MAP: Record<string, Block["type"]> = {
  text: "paragraph",
  paragraph: "paragraph",
  title: "heading",
  doc_title: "heading",
  image: "figure",
  seal: "seal",
  formula: "formula",
  table: "table",
};

function headingLevel(subType?: string): 1 | 2 | 3 | undefined {
  if (!subType) return undefined;
  if (subType === "doc_title" || subType === "title1") return 1;
  if (subType === "title2") return 2;
  if (subType === "title3") return 3;
  return undefined;
}

export function fromParser(
  parseResult: unknown,
  image: OcrDocument["image"],
): OcrDocument {
  const result = parseResult as ParseResultRaw;
  const pages = result?.pages ?? [];
  const blocks: Block[] = [];

  for (const page of pages) {
    const layouts = page.layouts ?? [];
    const pageTables = (page.tables ?? []) as ParserTableRaw[];
    const tableByLayoutId = new Map(
      pageTables.filter((t) => t.layout_id).map((t) => [t.layout_id as string, t]),
    );
    const usedTables = new Set<ParserTableRaw>();

    for (const layout of layouts) {
      const type = TYPE_MAP[layout.type ?? ""] ?? "paragraph";
      const bbox = toBbox(layout.position ?? layout.bbox);
      const text = layout.text ?? "";
      const base = { id: blockId(), bbox, source: "parser" as const };

      if (type === "table") {
        // layout_id 直接配对；配不上则取第一个未消费的表格
        const table =
          (layout.layout_id ? tableByLayoutId.get(layout.layout_id) : undefined) ??
          pageTables.find((t) => !usedTables.has(t));
        if (table) usedTables.add(table);
        const cells = extractTableCells(table) ?? [];
        const { rows, cols } = cells.length
          ? dimsFromCells(cells)
          : { rows: 0, cols: 0 };
        blocks.push({
          ...base,
          type: "table",
          table: { rows: Math.max(rows, 1), cols: Math.max(cols, 1), cells },
        });
      } else if (type === "figure") {
        blocks.push({ ...base, type: "figure" });
      } else if (type === "seal" || type === "formula") {
        blocks.push({ ...base, type, text });
      } else if (type === "heading") {
        blocks.push({
          ...base,
          type: "heading",
          text,
          level: headingLevel(layout.sub_type),
        });
      } else {
        blocks.push({ ...base, type: "paragraph", text });
      }
    }
  }

  return { schemaVersion: 1, image, blocks };
}

/**
 * 从单个表格原始数据提取 TableCell[]。
 *
 * 1. 旧 fixture 格式：cells 带 row_start/col_start/words，直接转换
 * 2. 真实 API：matrix[r][c] 为 cells 数组索引（重复 = 合并格），
 *    对每个索引收集其出现的行列范围即得稀疏坐标
 */
function extractTableCells(table: ParserTableRaw | undefined): TableCell[] | null {
  if (!table) return null;
  const rawCells = (table.cells ?? []) as ParserCellRaw[];

  // 旧格式：显式行列坐标
  const legacy = rawCells.filter(
    (c) =>
      typeof c.row_start === "number" &&
      typeof c.row_end === "number" &&
      typeof c.col_start === "number" &&
      typeof c.col_end === "number",
  );
  if (legacy.length === rawCells.length && rawCells.length > 0) {
    return rawCells.map((c) => ({
      rowStart: c.row_start!,
      rowEnd: c.row_end!,
      colStart: c.col_start!,
      colEnd: c.col_end!,
      text: c.words ?? c.text ?? "",
    }));
  }

  // 真实格式：matrix 索引网格 → 行列范围
  const matrix = table.matrix;
  if (!Array.isArray(matrix) || matrix.length === 0 || rawCells.length === 0) return null;

  const spans = new Map<number, { rMin: number; rMax: number; cMin: number; cMax: number }>();
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) return null;
    for (let c = 0; c < row.length; c++) {
      const idx = row[c];
      if (typeof idx !== "number") return null;
      const s = spans.get(idx);
      if (s) {
        s.rMin = Math.min(s.rMin, r);
        s.rMax = Math.max(s.rMax, r);
        s.cMin = Math.min(s.cMin, c);
        s.cMax = Math.max(s.cMax, c);
      } else {
        spans.set(idx, { rMin: r, rMax: r, cMin: c, cMax: c });
      }
    }
  }

  const cells: TableCell[] = [];
  for (const [idx, s] of spans) {
    const raw = rawCells[idx];
    if (!raw) continue;
    cells.push({
      rowStart: s.rMin,
      rowEnd: s.rMax,
      colStart: s.cMin,
      colEnd: s.cMax,
      text: raw.text ?? raw.words ?? "",
    });
  }
  return cells.length > 0 ? cells : null;
}
