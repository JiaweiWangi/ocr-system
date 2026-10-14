import { z } from "zod";

/**
 * 统一 OCR 文档格式（OcrDocument）
 *
 * 全系统数据枢纽：general / table / parser 三个引擎的输出
 * 全部归一化为这一种格式，前端编辑器和四个导出器只面对它。
 *
 * 坐标统一为图片像素坐标系，原点左上。
 */

export const bboxSchema = z.object({
  left: z.number().int().nonnegative(),
  top: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "table",
  "figure",
  "seal",
  "formula",
  "keyValue",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_SOURCES = ["general", "accurate", "table", "parser", "user"] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];

const blockBase = {
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  bbox: bboxSchema,
  source: z.enum(BLOCK_SOURCES),
  confidence: z.number().min(0).max(1).optional(),
};

/** 标题/段落块 */
export const textBlockSchema = z.object({
  ...blockBase,
  type: z.enum(["heading", "paragraph"]),
  text: z.string(),
  /** 仅 heading；来自 parser 的 sub_type：doc_title→1, title2→2, title3→3 */
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

/** 表格单元格：网格线编号，含两端。span = end - start + 1，稀疏表示天然支持合并单元格 */
export const tableCellSchema = z.object({
  rowStart: z.number().int().nonnegative(),
  rowEnd: z.number().int().nonnegative(),
  colStart: z.number().int().nonnegative(),
  colEnd: z.number().int().nonnegative(),
  text: z.string(),
});

export const tableDataSchema = z.object({
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  cells: z.array(tableCellSchema),
});

export const tableBlockSchema = z.object({
  ...blockBase,
  type: z.literal("table"),
  table: tableDataSchema,
});

export const figureBlockSchema = z.object({
  ...blockBase,
  type: z.literal("figure"),
  caption: z.string().optional(),
});

export const keyValueEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** 关键信息提取结果块（规则式 KIE 命中生成） */
export const keyValueBlockSchema = z.object({
  ...blockBase,
  type: z.literal("keyValue"),
  entries: z.array(keyValueEntrySchema),
});

/** 公式/印章：保留原始类型，编辑器按只读文本处理 */
export const readOnlyTextBlockSchema = z.object({
  ...blockBase,
  type: z.enum(["seal", "formula"]),
  text: z.string(),
});

export const blockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  tableBlockSchema,
  figureBlockSchema,
  keyValueBlockSchema,
  readOnlyTextBlockSchema,
]);

export const ocrDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  image: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    path: z.string(),
  }),
  blocks: z.array(blockSchema),
});

export type Bbox = z.infer<typeof bboxSchema>;
export type BlockSourceEnum = BlockSource;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type TableCell = z.infer<typeof tableCellSchema>;
export type TableData = z.infer<typeof tableDataSchema>;
export type FigureBlock = z.infer<typeof figureBlockSchema>;
export type KeyValueBlock = z.infer<typeof keyValueBlockSchema>;
export type KeyValueEntry = z.infer<typeof keyValueEntrySchema>;
export type ReadOnlyTextBlock = z.infer<typeof readOnlyTextBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
export type OcrDocument = z.infer<typeof ocrDocumentSchema>;

/** 生成块 id：编辑器内增删改以此寻址，需要跨保存稳定 */
export function blockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
