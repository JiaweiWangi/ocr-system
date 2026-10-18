import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromGeneral } from "../normalize/fromGeneral";
import { fromTable } from "../normalize/fromTable";
import { extractKeyInfo } from "./extract";
import type { OcrDocument } from "../normalize/types";

/**
 * 票据样张回放测试：samples/发票测试.png 的配套 fixtures
 * （general-发票测试.json / table-发票测试.json）走完整管线
 * 归一化 → KIE，锁定「正常识别生成 keyValue 块」不被回归破坏。
 *
 * 图片由 scripts 生成，坐标与 fixture 严格对应；含任务书票据场景的
 * 核心可提取字段：20 位发票号、开票日期、金额、手机号。
 */

const FIXTURES = join(process.cwd(), "fixtures");
const IMAGE: OcrDocument["image"] = { width: 920, height: 620, path: "发票测试.png" };

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8"));
}

describe("票据样张 · 通用模式回放", () => {
  const doc = fromGeneral(loadFixture("general-发票测试.json") as never, IMAGE);
  const kv = extractKeyInfo(doc);

  it("提取到发票号、日期、金额、手机号", () => {
    expect(kv).not.toBeNull();
    const entries = kv!.entries;
    const values = entries.map((e) => e.value);

    // 20 位发票号码（规则命中的是含标签的整句）
    expect(values.some((v) => v.includes("24122000000123456789"))).toBe(true);
    // 开票日期
    expect(values).toContain("2026年10月18日");
    // 三处金额：明细 ¥890.00、税额 ¥110.00、价税合计 ¥1000.00（去重后）
    expect(values).toContain("¥890.00");
    expect(values).toContain("¥110.00");
    expect(values).toContain("¥1000.00");
    // 购买方联系电话
    expect(values).toContain("13812345678");
  });

  it("key 类型正确且无重复值", () => {
    const keys = new Set(kv!.entries.map((e) => e.key));
    for (const k of ["日期", "金额", "发票号码", "手机号"]) expect(keys).toContain(k);
    const values = kv!.entries.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("票据样张 · 表格模式回放", () => {
  const tableResult = loadFixture("table-发票测试.json") as never;
  const generalResult = loadFixture("general-发票测试.json") as never;
  const doc = fromTable(tableResult, IMAGE, generalResult);
  const kv = extractKeyInfo(doc);

  it("表格单元格中的金额被提取（textOf 表格分支）", () => {
    expect(kv).not.toBeNull();
    const values = kv!.entries.map((e) => e.value);
    expect(values).toContain("¥890.00");
    expect(values).toContain("¥110.00");
  });

  it("表外文字（价税合计小写金额）同样被提取", () => {
    const values = kv!.entries.map((e) => e.value);
    expect(values).toContain("¥1000.00");
    expect(values).toContain("2026年10月18日");
  });
});
