import ExcelJS from "exceljs";
import type { OcrDocument, TableData } from "@/lib/normalize/types";
import { buildTextMatrix } from "./index";

/**
 * OcrDocument → xlsx（exceljs）
 * 每个 TableBlock 一个 worksheet（"表格1"…），非表格文本汇总到"文本" worksheet。
 * 合并单元格用 worksheet.mergeCells 表达。
 */

export async function toXlsx(doc: OcrDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const textParts: string[] = [];
  let tableIndex = 0;

  for (const block of doc.blocks) {
    if (block.type === "table") {
      tableIndex++;
      const ws = wb.addWorksheet(`表格${tableIndex}`);
      writeTableSheet(ws, block.table);
    } else {
      const text =
        block.type === "figure"
          ? block.caption
            ? `[图片: ${block.caption}]`
            : "[图片]"
          : block.type === "keyValue"
            ? block.entries.map((e) => `${e.key}: ${e.value}`).join("\n")
            : block.text;
      if (text?.trim()) textParts.push(text);
    }
  }

  const ws = wb.addWorksheet("文本");
  textParts.forEach((t, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = t;
    cell.alignment = { wrapText: true, vertical: "top" };
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function writeTableSheet(ws: ExcelJS.Worksheet, table: TableData) {
  const matrix = buildTextMatrix(table);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      ws.getCell(r + 1, c + 1).value = matrix[r][c];
    }
  }
  // 合并单元格：span>1 的 cell 用 mergeCells 覆盖
  for (const cell of table.cells) {
    const rowSpan = cell.rowEnd - cell.rowStart + 1;
    const colSpan = cell.colEnd - cell.colStart + 1;
    if (rowSpan > 1 || colSpan > 1) {
      ws.mergeCells(
        cell.rowStart + 1,
        cell.colStart + 1,
        cell.rowEnd + 1,
        cell.colEnd + 1,
      );
    }
  }
  ws.columns.forEach((col) => {
    if (!col.width || col.width < 12) col.width = 12;
  });
}
