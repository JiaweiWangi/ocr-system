import { callOcrApi } from "./client";

/**
 * 表格文字识别 V2 —— 同步接口，一次 POST 直接返回
 * 文档: https://cloud.baidu.com/doc/OCR/s/Al1zvpylt
 *
 * 真实响应结构（2026-10 实测）：
 * - body/footer 单元格用网格线编号（row_start/row_end/col_start/col_end，含两端），
 *   天然表达合并单元格跨行跨列
 * - header 单元格【没有】网格编号，只有 location（像素四角多边形）——
 *   需按像素位置对齐到 body 的网格
 * - 顶层计数字段是 table_num（文档写 tables_result_num，实测为 table_num）
 */

/** body/footer 单元格：带网格编号 */
export interface TableV2GridCell {
  row_start: number;
  row_end: number;
  col_start: number;
  col_end: number;
  words: string;
  cell_location?: { x: number; y: number }[];
}

/** header/footer 单元格：只有像素位置和按行拆分的文字，无网格编号（官方文档确认） */
export interface TableV2TextCell {
  words: string;
  location?: { x: number; y: number }[];
  row_start?: number;
  row_end?: number;
  col_start?: number;
  col_end?: number;
}

export interface TableV2Table {
  table_location?: { x: number; y: number }[];
  header?: TableV2TextCell[];
  body?: TableV2GridCell[];
  /** 表尾：同 header 形态（location + words），不是网格单元格 */
  footer?: TableV2TextCell[];
}

export interface TableV2Result {
  tables_result: TableV2Table[];
  table_num?: number;
  tables_result_num?: number; // 文档写法，兼容两种
  log_id: number;
}

export function tableOcr(imageBase64: string, signal?: AbortSignal): Promise<TableV2Result> {
  return (async () =>
    (await callOcrApi("/rest/2.0/ocr/v1/table", {
      image: imageBase64,
    }, signal)) as unknown as TableV2Result)();
}

export function polygonToBbox(poly: { x: number; y: number }[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}
