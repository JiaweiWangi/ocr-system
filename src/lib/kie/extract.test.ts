import { describe, it, expect } from "vitest";
import { extractKeyInfo } from "./extract";
import type { OcrDocument } from "../normalize/types";

function doc(blocks: OcrDocument["blocks"]): OcrDocument {
  return {
    schemaVersion: 1,
    image: { width: 100, height: 100, path: "test.jpg" },
    blocks,
  };
}

/** 一个最小正文块 */
function textBlock(text: string) {
  return {
    id: "b_text",
    type: "paragraph" as const,
    bbox: { left: 0, top: 0, width: 10, height: 10 },
    source: "general" as const,
    text,
  };
}

/** 一个 2×2 票据表格：金额、日期在单元格里 */
function tableBlock() {
  return {
    id: "b_table",
    type: "table" as const,
    bbox: { left: 0, top: 20, width: 80, height: 40 },
    source: "table" as const,
    table: {
      rows: 2,
      cols: 2,
      cells: [
        { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, text: "开票日期" },
        { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1, text: "2026年10月14日" },
        { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0, text: "价税合计" },
        { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1, text: "¥1,234.56" },
      ],
    },
  };
}

describe("extractKeyInfo", () => {
  it("无命中返回 null", () => {
    expect(extractKeyInfo(doc([textBlock("没有任何关键信息的普通文本")]))).toBeNull();
  });

  it("从文本块提取日期/金额/手机号", () => {
    const kv = extractKeyInfo(
      doc([textBlock("开票日期：2026-10-14，联系电话 13812345678，合计 ¥99.90")]),
    );
    expect(kv).not.toBeNull();
    const values = kv!.entries.map((e) => e.value);
    expect(values).toContain("2026-10-14");
    expect(values).toContain("13812345678");
    expect(values).toContain("¥99.90");
    expect(kv!.type).toBe("keyValue");
  });

  it("从表格单元格提取金额与日期（票据核心场景）", () => {
    const kv = extractKeyInfo(doc([tableBlock()]));
    expect(kv).not.toBeNull();
    const values = kv!.entries.map((e) => e.value);
    expect(values).toContain("2026年10月14日");
    expect(values).toContain("¥1,234.56");
  });

  it("相同值只保留一条", () => {
    const kv = extractKeyInfo(
      doc([textBlock("电话 13812345678 与 13812345678 重复")]),
    );
    const phones = kv!.entries.filter((e) => e.key === "手机号");
    expect(phones).toHaveLength(1);
  });

  it("跳过 figure 块（无可提取文本）", () => {
    const kv = extractKeyInfo(
      doc([
        {
          id: "b_fig",
          type: "figure",
          bbox: { left: 0, top: 0, width: 10, height: 10 },
          source: "parser",
        },
      ]),
    );
    expect(kv).toBeNull();
  });
});
