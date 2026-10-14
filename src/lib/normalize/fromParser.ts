import { blockId, type Block, type OcrDocument, type TableCell } from "./types";
import { dimsFromCells } from "./tableMath";

/**
 * 文档解析 parse_result → OcrDocument（承担版面分析）
 *
 * parse_result.pages[].layouts[]: { type, sub_type?, bbox }
 * - type 映射: text→paragraph, title→heading, image→figure, seal→seal, formula→formula
 * - sub_type: doc_title→level1, title2→level2, title3→level3
 * - 表格块从同页的 tables 数据取（parser 结果中表格为独立数组，与 layout 块对应关系
 *   按 bbox 就近匹配；取不到时表格块退化为空表格）
 *
 * 注：文档解析返回结构随版本有差异，适配器对缺字段做容错。
 */

interface ParserLayoutRaw {
  type?: string;
  sub_type?: string;
  bbox?: number[]; // [left, top, width, height]
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
    // 页内表格数据（形态不定，尽力提取 cells 数组）
    const pageTables = (page.tables ?? []) as Record<string, unknown>[];

    for (const layout of layouts) {
      const type = TYPE_MAP[layout.type ?? ""] ?? "paragraph";
      const bbox = toBbox(layout.bbox);
      const base = { id: blockId(), bbox, source: "parser" as const };

      if (type === "table") {
        // 就近匹配 bbox 的表格数据；取不到则给空表
        const cells = extractTableCells(pageTables) ?? [];
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
        blocks.push({ ...base, type, text: "" });
      } else if (type === "heading") {
        blocks.push({
          ...base,
          type: "heading",
          text: "",
          level: headingLevel(layout.sub_type),
        });
      } else {
        blocks.push({ ...base, type: "paragraph", text: "" });
      }
    }
  }

  return { schemaVersion: 1, image, blocks };
}

/** 从形态不定的 tables 数组中尽力提取 TableCell[]；识别不出返回 null */
function extractTableCells(tables: Record<string, unknown>[]): TableCell[] | null {
  for (const t of tables) {
    const maybeCells = (t.cells ?? t.body ?? t.header) as unknown;
    if (!Array.isArray(maybeCells)) continue;
    const cells: TableCell[] = [];
    let ok = true;
    for (const c of maybeCells) {
      const cell = c as Record<string, unknown>;
      if (
        typeof cell.row_start === "number" &&
        typeof cell.row_end === "number" &&
        typeof cell.col_start === "number" &&
        typeof cell.col_end === "number"
      ) {
        cells.push({
          rowStart: cell.row_start,
          rowEnd: cell.row_end,
          colStart: cell.col_start,
          colEnd: cell.col_end,
          text: typeof cell.words === "string" ? cell.words : "",
        });
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cells.length > 0) return cells;
  }
  return null;
}
