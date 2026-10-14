import { describe, it, expect } from "vitest";
import {
  buildMatrix,
  insertRow,
  insertCol,
  deleteRow,
  deleteCol,
  mergeCells,
  splitCell,
  dimsFromCells,
} from "./tableMath";
import type { TableCell, TableData } from "./types";

/** 3×3 无合并的简单表格 */
function simpleTable(): TableData {
  const cells: TableCell[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      cells.push({ rowStart: r, rowEnd: r, colStart: c, colEnd: c, text: `${r}-${c}` });
  return { rows: 3, cols: 3, cells };
}

/** 带合并单元格：r0c0 跨 2 列，r1-r2 c0 跨 2 行 */
function mergedTable(): TableData {
  return {
    rows: 3,
    cols: 3,
    cells: [
      { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1, text: "横向合并" },
      { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 2, text: "0-2" },
      { rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 0, text: "纵向合并" },
      { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1, text: "1-1" },
      { rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2, text: "1-2" },
      { rowStart: 2, rowEnd: 2, colStart: 1, colEnd: 1, text: "2-1" },
      { rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 2, text: "2-2" },
    ],
  };
}

describe("buildMatrix", () => {
  it("无合并表格：每格指向自己", () => {
    const m = buildMatrix(simpleTable().cells, 3, 3);
    expect(m[1][2]?.text).toBe("1-2");
  });

  it("合并单元格：矩阵内多个位置指向同一 cell", () => {
    const m = buildMatrix(mergedTable().cells, 3, 3);
    expect(m[0][0]).toBe(m[0][1]); // 横向合并
    expect(m[1][0]).toBe(m[2][0]); // 纵向合并
  });
});

describe("insertRow", () => {
  it("中间插行：后续行坐标 +1，新行为空", () => {
    const t = insertRow(simpleTable(), 1);
    expect(t.rows).toBe(4);
    const cell20 = t.cells.find((c) => c.text === "2-0");
    expect(cell20?.rowStart).toBe(3); // 原 2-0 移到 3-0
    const newCell = t.cells.find((c) => c.rowStart === 1 && c.rowStart === c.rowEnd && c.text === "");
    expect(newCell).toBeDefined();
  });

  it("在合并格起始行前插行：合并格整体下移", () => {
    const t = insertRow(mergedTable(), 1);
    const vMerge = t.cells.find((c) => c.text === "纵向合并");
    expect(vMerge?.rowStart).toBe(2);
    expect(vMerge?.rowEnd).toBe(3);
  });

  it("在合并格中间插行：合并格行数 +1（跨行扩展）", () => {
    // 在 r2 插行，纵向合并(1-2) 变成跨 3 行
    const t = insertRow(mergedTable(), 2);
    const vMerge = t.cells.find((c) => c.text === "纵向合并");
    expect(vMerge?.rowStart).toBe(1);
    expect(vMerge?.rowEnd).toBe(3);
  });
});

describe("deleteRow", () => {
  it("删除普通行：后续行坐标 -1", () => {
    const t = deleteRow(simpleTable(), 0);
    expect(t.rows).toBe(2);
    const cell10 = t.cells.find((c) => c.text === "1-0");
    expect(cell10?.rowStart).toBe(0);
  });

  it("删除合并格跨过的行：合并格收缩（rowEnd-1）", () => {
    const t = deleteRow(mergedTable(), 2); // 纵向合并(1-2) 跨过 r2
    const vMerge = t.cells.find((c) => c.text === "纵向合并");
    expect(vMerge?.rowStart).toBe(1);
    expect(vMerge?.rowEnd).toBe(1); // 收缩为单行
  });

  it("删除合并格的起始行：起始边界下移", () => {
    const t = deleteRow(mergedTable(), 1);
    const vMerge = t.cells.find((c) => c.text === "纵向合并");
    expect(vMerge?.rowStart).toBe(1);
    expect(vMerge?.rowEnd).toBe(1);
  });
});

describe("deleteCol", () => {
  it("删除合并格覆盖的列：横向合并收缩", () => {
    const t = deleteCol(mergedTable(), 1); // 横向合并(0-1) 覆盖 c1
    const hMerge = t.cells.find((c) => c.text === "横向合并");
    expect(hMerge?.colStart).toBe(0);
    expect(hMerge?.colEnd).toBe(0);
    expect(t.cols).toBe(2);
  });

  it("删除合并格起始列：起始边界右移", () => {
    const t = deleteCol(mergedTable(), 0);
    const hMerge = t.cells.find((c) => c.text === "横向合并");
    expect(hMerge?.colStart).toBe(0);
    expect(hMerge?.colEnd).toBe(0);
  });
});

describe("mergeCells / splitCell", () => {
  it("合并：坐标取外包，文本拼接", () => {
    const merged = mergeCells([
      { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, text: "A" },
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1, text: "B" },
      { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 1, text: "C" },
    ]);
    expect(merged).toEqual({
      rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1, text: "A B C",
    });
  });

  it("拆分：文本留在左上格，其余为空", () => {
    const pieces = splitCell({ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1, text: "X" });
    expect(pieces).toHaveLength(4);
    expect(pieces[0].text).toBe("X");
    expect(pieces.slice(1).every((p) => p.text === "")).toBe(true);
  });
});

describe("dimsFromCells", () => {
  it("从 cells 推导网格尺寸", () => {
    expect(dimsFromCells(mergedTable().cells)).toEqual({ rows: 3, cols: 3 });
  });
});
