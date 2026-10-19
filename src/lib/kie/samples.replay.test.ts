import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromGeneral } from "../normalize/fromGeneral";
import { fromTable } from "../normalize/fromTable";
import { fromParser } from "../normalize/fromParser";
import { extractKeyInfo } from "./extract";
import type { OcrDocument } from "../normalize/types";

/**
 * 样张套件回放测试：samples/ 下的生成样张 + fixtures/ 配套回放数据，
 * 走完整「归一化 → KIE」链路。每个样张考察点见 samples/README.md。
 *
 * - 海报测试（通用模式）：大段间距段落分组；邮箱 / URL / 手机号 / 日期规则
 * - 收据测试（表格模式）：表内合并单元格；千分位 / 「元」后缀 / 4 位无逗号金额；表外日期
 * - 试卷测试（深度模式）：doc_title/title2 层级映射、formula 只读块、
 *   matrix 合并格（整行合并 + 跨列合并）、表格内身份证号提取
 */

const FIXTURES = join(process.cwd(), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8"));
}

function kvValues(doc: OcrDocument): string[] {
  const kv = extractKeyInfo(doc);
  expect(kv, "应有 keyValue 提取结果").not.toBeNull();
  return kv!.entries.map((e) => e.value);
}

describe("海报样张 · 通用模式", () => {
  const image: OcrDocument["image"] = { width: 760, height: 1000, path: "海报测试.png" };
  const doc = fromGeneral(loadFixture("general-海报测试.json") as never, image);

  it("大段间距切分出多个段落块（groupByGap）", () => {
    const texts = doc.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : []));
    // 标题+副标题 / 口号 / 信息区 5 行 / 票价 / 落款 = 5 组
    expect(texts.length).toBe(5);
    expect(texts.some((t) => t.includes("开发者大会"))).toBe(true);
    expect(texts.some((t) => t.includes("主办方"))).toBe(true);
    // 信息区行距小：时间～官网 5 行合并为一个段落块
    const info = texts.find((t) => t.includes("报名咨询"));
    expect(info).toBeDefined();
    expect(info!).toContain("时间：");
    expect(info!).toContain("官网：");
    // 大间距：票价独立成段
    const ticket = texts.find((t) => t.includes("门票"));
    expect(ticket).toBeDefined();
    expect(ticket).not.toBe(info);
  });

  it("提取邮箱 / URL / 手机号 / 日期", () => {
    const values = kvValues(doc);
    expect(values).toContain("contact@example.com");
    expect(values).toContain("https://example.com/devconf2026");
    expect(values).toContain("15912345678");
    expect(values).toContain("2026年11月8日");
    expect(values).toContain("2026年10月31日");
  });

  it("门票金额被提取（含 ¥199 / ¥99）", () => {
    const values = kvValues(doc);
    expect(values).toContain("¥199");
    expect(values).toContain("¥99");
  });
});

describe("收据样张 · 表格模式", () => {
  const image: OcrDocument["image"] = { width: 820, height: 560, path: "收据测试.png" };
  const doc = fromTable(
    loadFixture("table-收据测试.json") as never,
    image,
    loadFixture("general-收据测试.json") as never,
  );

  it("还原表格：整行合并抬头 + 合计行跨列合并", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    const cells = table!.table.cells;
    // 缴费单位：整行合并（4 列）
    const payer = cells.find((c) => c.text.includes("北京云图科技"));
    expect(payer).toMatchObject({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 3 });
    // 合计大写：跨前 3 列
    const total = cells.find((c) => c.text.includes("贰仟元整"));
    expect(total).toMatchObject({ rowStart: 5, rowEnd: 5, colStart: 0, colEnd: 2 });
    expect(table!.table.rows).toBe(6);
    expect(table!.table.cols).toBe(4);
  });

  it("表格内金额：千分位 / 元后缀 / 4 位无逗号（回归）", () => {
    const values = kvValues(doc);
    expect(values).toContain("¥1,234.56");
    expect(values).toContain("560元");
    expect(values).toContain("¥78.90");
    // 2026-10 修复的规则：4 位无逗号金额不再被截断
    expect(values).toContain("¥1,873.46");
  });

  it("表外文字归一化为段落：编号 / 开票日期 / 落款", () => {
    const texts = doc.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : []));
    expect(texts.some((t) => t.includes("NO.00881234"))).toBe(true);
    expect(texts.some((t) => t.includes("收款人"))).toBe(true);
    expect(kvValues(doc)).toContain("2026-10-19");
  });

  it("表内数字（无货币符号 / 无元后缀）不误报为金额", () => {
    const values = kvValues(doc);
    expect(values).not.toContain("1,234.56"); // 单价列裸数字
    expect(values).not.toContain("280");
  });
});

describe("试卷样张 · 深度模式（parser）", () => {
  const image: OcrDocument["image"] = { width: 900, height: 1200, path: "试卷测试.png" };
  const doc = fromParser(loadFixture("parser-试卷测试.json"), image);

  it("版面分类：doc_title → level 1 标题、title2 → level 2 标题、formula 只读块", () => {
    const title = doc.blocks.find((b) => b.type === "heading" && b.text.includes("期中考试"));
    expect(title).toMatchObject({ level: 1 });
    const h1 = doc.blocks.find((b) => b.type === "heading" && b.text.includes("一、选择题"));
    expect(h1).toMatchObject({ level: 2 });
    const formula = doc.blocks.find((b) => b.type === "formula");
    expect(formula).toMatchObject({ text: "E = mc²" });
  });

  it("matrix 合并格：身份证号整行合并、总分跨列合并", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    const cells = table!.table.cells;
    const idRow = cells.find((c) => c.text.includes("身份证号"));
    expect(idRow).toMatchObject({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 2 });
    const total = cells.find((c) => c.text === "总分");
    expect(total).toMatchObject({ rowStart: 4, rowEnd: 4, colStart: 0, colEnd: 1 });
  });

  it("提取表格 matrix 单元格中的身份证号 + 日期", () => {
    const values = kvValues(doc);
    expect(values).toContain("110101200001011234");
    expect(values).toContain("2026年10月19日");
  });
});
