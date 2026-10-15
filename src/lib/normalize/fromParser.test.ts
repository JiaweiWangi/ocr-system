import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromParser } from "./fromParser";
import { buildMatrix } from "./tableMath";
import type { OcrDocument } from "./types";

/**
 * 真实百度 parse_result 回放测试。
 * fixtures/parser-default.json 录制自真实文档解析响应（2026-10），
 * 锁定真实数据结构（position / matrix 索引网格 / layout_id 配对）不被回归破坏。
 */

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "parser-default.json"), "utf-8"),
) as unknown;

const IMAGE: OcrDocument["image"] = { width: 3145, height: 1471, path: "test.png" };

describe("fromParser · 真实 parse_result 结构", () => {
  const doc = fromParser(FIXTURE, IMAGE);

  it("生成块且 bbox 来自 position 字段", () => {
    expect(doc.blocks.length).toBeGreaterThan(0);
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    // 真实响应 layout.position = [3, 72, 3139, 1377]
    expect(table!.bbox).toEqual({ left: 3, top: 72, width: 3139, height: 1377 });
  });

  it("matrix 索引网格重建出行列坐标（含合并单元格）", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    if (table!.type !== "table") throw new Error("unreachable");

    const { rows, cols, cells } = table!.table;
    expect(rows).toBe(8);
    expect(cols).toBe(12);
    expect(cells.length).toBeGreaterThan(0);

    // 每个格子都有文本可渲染（矩阵无空洞）
    const matrix = buildMatrix(cells, rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(matrix[r][c], `matrix[${r}][${c}]`).not.toBeNull();
      }
    }

    // 真实数据：首行第 4 列起为跨 4 列合并格（matrix row0 = [0,1,2,3,3,3,3,...]）
    const merged = cells.find((c) => c.colEnd > c.colStart);
    expect(merged).toBeDefined();
  });

  it("块文本非空（真实 layouts 内联 text 字段）", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    if (table!.type !== "table") throw new Error("unreachable");
    const nonEmpty = table!.table.cells.filter((c) => c.text.length > 0);
    expect(nonEmpty.length).toBeGreaterThan(10);
  });
});
