import type { TableCell, TableData } from "./types";

/**
 * 表格坐标数学：cells（稀疏、网格线编号）与渲染矩阵互转、
 * 增删行列的坐标平移、合并/拆分。纯函数，vitest 全覆盖。
 */

/** cells → rows×cols 的渲染矩阵，matrix[r][c] = 指向覆盖该格的 cell 引 */
export function buildMatrix(cells: TableCell[], rows: number, cols: number): (TableCell | null)[][] {
  const matrix: (TableCell | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
  for (const cell of cells) {
    for (let r = cell.rowStart; r <= cell.rowEnd; r++) {
      for (let c = cell.colStart; c <= cell.colEnd; c++) {
        if (r < rows && c < cols) matrix[r][c] = cell;
      }
    }
  }
  return matrix;
}

/** 渲染矩阵中该 cell 是否应渲染（跨行跨列时只渲染左上角，其余由 rowspan/colspan 覆盖） */
export function isOrigin(cell: TableCell, r: number, c: number): boolean {
  return cell.rowStart === r && cell.colStart === c;
}

export function spanSize(cell: TableCell): { rowSpan: number; colSpan: number } {
  return {
    rowSpan: cell.rowEnd - cell.rowStart + 1,
    colSpan: cell.colEnd - cell.colStart + 1,
  };
}

/** 在第 at 行前插入一行：所有 rowStart/rowEnd >= at 的坐标 +1；整行在新行生成空 cell */
export function insertRow(table: TableData, at: number): TableData {
  const clamped = Math.max(0, Math.min(at, table.rows));
  const cells = table.cells.map((cell) => ({
    ...cell,
    rowStart: cell.rowStart >= clamped ? cell.rowStart + 1 : cell.rowStart,
    rowEnd: cell.rowEnd >= clamped ? cell.rowEnd + 1 : cell.rowEnd,
  }));
  const newCells: TableCell[] = Array.from({ length: table.cols }, (_, c) => ({
    rowStart: clamped,
    rowEnd: clamped,
    colStart: c,
    colEnd: c,
    text: "",
  }));
  return { rows: table.rows + 1, cols: table.cols, cells: [...cells, ...newCells] };
}

/** 在第 at 列前插入一列 */
export function insertCol(table: TableData, at: number): TableData {
  const clamped = Math.max(0, Math.min(at, table.cols));
  const cells = table.cells.map((cell) => ({
    ...cell,
    colStart: cell.colStart >= clamped ? cell.colStart + 1 : cell.colStart,
    colEnd: cell.colEnd >= clamped ? cell.colEnd + 1 : cell.colEnd,
  }));
  const newCells: TableCell[] = Array.from({ length: table.rows }, (_, r) => ({
    rowStart: r,
    rowEnd: r,
    colStart: clamped,
    colEnd: clamped,
    text: "",
  }));
  return { rows: table.rows, cols: table.cols + 1, cells: [...cells, ...newCells] };
}

/**
 * 删除第 at 行（含两端坐标语义）：
 * - 完全在删除行内的 cell 移除
 * - 跨过该行的 cell rowEnd -1（若 rowStart == at 且 rowEnd > at，rowStart 也 +1）
 * - 后续行坐标 -1
 */
export function deleteRow(table: TableData, at: number): TableData {
  const cells: TableCell[] = [];
  for (const cell of table.cells) {
    const { rowStart, rowEnd } = cell;
    if (rowStart === at && rowEnd === at) continue; // 整格在此行，删除
    let ns = rowStart;
    let ne = rowEnd;
    if (rowEnd >= at) ne = rowEnd - 1;
    if (rowStart > at) ns = rowStart - 1;
    // 跨行格且删除其起始行：上边界下移
    if (rowStart === at && rowEnd > at) ns = at;
    if (ns > ne) continue; // 收缩为空，删除
    cells.push({ ...cell, rowStart: ns, rowEnd: ne });
  }
  return { rows: Math.max(0, table.rows - 1), cols: table.cols, cells };
}

/** 删除第 at 列 */
export function deleteCol(table: TableData, at: number): TableData {
  const cells: TableCell[] = [];
  for (const cell of table.cells) {
    const { colStart, colEnd } = cell;
    if (colStart === at && colEnd === at) continue;
    let ns = colStart;
    let ne = colEnd;
    if (colEnd >= at) ne = colEnd - 1;
    if (colStart > at) ns = colStart - 1;
    if (colStart === at && colEnd > at) ns = at;
    if (ns > ne) continue;
    cells.push({ ...cell, colStart: ns, colEnd: ne });
  }
  return { rows: table.rows, cols: Math.max(0, table.cols - 1), cells };
}

/** 合并矩阵选中区域（cells 列表）：文本拼接，坐标取外包 */
export function mergeCells(cells: TableCell[]): TableCell {
  const rowStart = Math.min(...cells.map((c) => c.rowStart));
  const rowEnd = Math.max(...cells.map((c) => c.rowEnd));
  const colStart = Math.min(...cells.map((c) => c.colStart));
  const colEnd = Math.max(...cells.map((c) => c.colEnd));
  const text = cells
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ");
  return { rowStart, rowEnd, colStart, colEnd, text };
}

/** 拆分合并单元格：文本留在左上格 */
export function splitCell(cell: TableCell): TableCell[] {
  const out: TableCell[] = [];
  for (let r = cell.rowStart; r <= cell.rowEnd; r++) {
    for (let c = cell.colStart; c <= cell.colEnd; c++) {
      out.push({
        rowStart: r,
        rowEnd: r,
        colStart: c,
        colEnd: c,
        text: r === cell.rowStart && c === cell.colStart ? cell.text : "",
      });
    }
  }
  return out;
}

/** 从 cells 推导网格尺寸（rows = 最大 rowEnd + 1） */
export function dimsFromCells(cells: TableCell[]): { rows: number; cols: number } {
  const rows = cells.length ? Math.max(...cells.map((c) => c.rowEnd)) + 1 : 0;
  const cols = cells.length ? Math.max(...cells.map((c) => c.colEnd)) + 1 : 0;
  return { rows, cols };
}
