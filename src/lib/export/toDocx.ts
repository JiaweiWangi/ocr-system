import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { OcrDocument, TableData } from "@/lib/normalize/types";

/**
 * OcrDocument → docx（docx 库声明式 API）
 * 表格合并单元格用 columnSpan/rowSpan 表达。
 */

const headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

export async function toDocx(doc: OcrDocument, title: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        children.push(
          new Paragraph({
            text: block.text,
            heading: headingLevelMap[block.level ?? 1],
          }),
        );
        break;
      case "paragraph":
        if (block.text.trim())
          children.push(new Paragraph({ text: block.text }));
        break;
      case "seal":
        if (block.text.trim())
          children.push(new Paragraph({ text: `【印章】${block.text}` }));
        break;
      case "formula":
        if (block.text.trim())
          children.push(
            new Paragraph({ children: [new TextRun({ text: block.text, italics: true })] }),
          );
        break;
      case "figure":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.caption ? `[图片: ${block.caption}]` : "[图片]", italics: true, color: "888888" })],
          }),
        );
        break;
      case "table":
        children.push(tableToDocx(block.table));
        break;
      case "keyValue":
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: block.entries.map(
              (e) =>
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({ children: [new TextRun({ text: e.key, bold: true })] }),
                      ],
                    }),
                    new TableCell({ children: [new Paragraph({ text: e.value })] }),
                  ],
                }),
            ),
          }),
        );
        break;
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
          ...children,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

/**
 * TableData → docx Table。
 * docx 库的 rowSpan 语义：被合并格仍然要渲染空 TableCell 并标记 continued，
 * 这里用简化的等价做法：每个物理行输出覆盖该行的 cells，
 * columnSpan 处理横向合并，rowSpan 处理纵向合并（docx 自动吞掉被覆盖格）。
 */
function tableToDocx(table: TableData): Table {
  const rows: TableRow[] = [];

  for (let r = 0; r < table.rows; r++) {
    const cellsInRow = table.cells
      .filter((c) => c.rowStart === r && c.colStart <= c.colEnd)
      .sort((a, b) => a.colStart - b.colStart);

    const docxCells = cellsInRow.map((cell) => {
      const colSpan = cell.colEnd - cell.colStart + 1;
      const rowSpan = cell.rowEnd - cell.rowStart + 1;
      return new TableCell({
        columnSpan: colSpan,
        rowSpan,
        children: [new Paragraph({ text: cell.text })],
      });
    });

    if (docxCells.length > 0) rows.push(new TableRow({ children: docxCells }));
  }

  return rows.length
    ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
    : new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("")] })] })],
      });
}
