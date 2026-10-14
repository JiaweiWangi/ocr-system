import type { Block, OcrDocument, TableData } from "@/lib/normalize/types";

/**
 * 导出序列化：OcrDocument → txt / md / docx / xlsx
 * 按 blocks 顺序遍历；keyValue 块 → 两列表格语义。
 */

export function toTxt(doc: OcrDocument): string {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    parts.push(blockToPlain(block));
  }
  return parts.join("\n\n") + "\n";
}

function blockToPlain(block: Block): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "seal":
    case "formula":
      return block.text;
    case "figure":
      return block.caption ? `[图片: ${block.caption}]` : "[图片]";
    case "table":
      return tableToTsv(block.table);
    case "keyValue":
      return block.entries.map((e) => `${e.key}: ${e.value}`).join("\n");
  }
}

export function tableToTsv(table: TableData): string {
  const matrix = buildTextMatrix(table);
  return matrix.map((row) => row.join("\t")).join("\n");
}

/** 表格 → rows×cols 文本矩阵（合并单元格文本只落在左上格） */
export function buildTextMatrix(table: TableData): string[][] {
  const matrix: string[][] = Array.from({ length: table.rows }, () =>
    Array.from({ length: table.cols }, () => ""),
  );
  for (const cell of table.cells) {
    if (cell.rowStart < table.rows && cell.colStart < table.cols) {
      matrix[cell.rowStart][cell.colStart] = cell.text;
    }
  }
  return matrix;
}

export function toMarkdown(doc: OcrDocument): string {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        parts.push(`${"#".repeat(block.level ?? 1)} ${block.text}`);
        break;
      case "paragraph":
        if (block.text.trim()) parts.push(block.text);
        break;
      case "seal":
        if (block.text.trim()) parts.push(`> 印章: ${block.text}`);
        break;
      case "formula":
        if (block.text.trim()) parts.push(`$$${block.text}$$`);
        break;
      case "figure":
        parts.push(block.caption ? `![${block.caption}](图片)` : `![图片](图片)`);
        break;
      case "table":
        parts.push(tableToHtml(block.table));
        break;
      case "keyValue":
        parts.push(
          block.entries.map((e) => `- **${e.key}**: ${e.value}`).join("\n"),
        );
        break;
    }
  }
  return parts.join("\n\n") + "\n";
}

/** GFM 表格不支持合并单元格，用内嵌 HTML */
export function tableToHtml(table: TableData): string {
  const lines: string[] = ['<table>'];
  const seen = new Set<string>();
  for (let r = 0; r < table.rows; r++) {
    lines.push("  <tr>");
    for (let c = 0; c < table.cols; c++) {
      const cell = table.cells.find(
        (cl) => r >= cl.rowStart && r <= cl.rowEnd && c >= cl.colStart && c <= cl.colEnd,
      );
      if (!cell) continue;
      const key = `${cell.rowStart}-${cell.colStart}`;
      if (seen.has(key)) continue; // rowspan/colspan 已覆盖
      seen.add(key);
      const rowSpan = cell.rowEnd - cell.rowStart + 1;
      const colSpan = cell.colEnd - cell.colStart + 1;
      const attrs = [
        rowSpan > 1 ? `rowspan="${rowSpan}"` : "",
        colSpan > 1 ? `colspan="${colSpan}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`    <td${attrs ? " " + attrs : ""}>${escapeHtml(cell.text)}</td>`);
    }
    lines.push("  </tr>");
  }
  lines.push("</table>");
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
