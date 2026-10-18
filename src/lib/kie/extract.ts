import type { KeyValueBlock, OcrDocument, Block } from "../normalize/types";
import { blockId } from "../normalize/types";

/**
 * 规则式关键信息提取（KIE）：
 * 对所有文本块跑正则库（日期/金额/票据号/手机号/邮箱/URL/身份证号），
 * 命中项生成 KeyValueBlock（source 标记），用户在面板中确认/修正。
 */

interface Rule {
  key: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    key: "日期",
    // 2026-10-14 / 2026/10/14 / 2026年10月14日
    pattern: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g,
  },
  {
    key: "金额",
    // ¥123.45 / 123.45元 / ¥1,234.56
    pattern: /[¥￥]\s?\d{1,3}(,\d{3})*(\.\d{1,2})?|\d{1,3}(,\d{3})*(\.\d{1,2})?\s?元/g,
  },
  {
    key: "发票号码",
    // 8位或20位数字（常见发票代码/号码）
    pattern: /(?:发票号码|发票号)[:：]?\s*(\d{8}|\d{20})|(?<!\d)(\d{20})(?!\d)/g,
  },
  {
    key: "手机号",
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  },
  { key: "邮箱", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { key: "URL", pattern: /https?:\/\/[^\s，。、""）)]+/g },
  {
    key: "身份证号",
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
  },
];

/** 从文档所有文本中提取关键信息；无命中返回 null */
export function extractKeyInfo(doc: OcrDocument): KeyValueBlock | null {
  const entries: KeyValueBlock["entries"] = [];

  for (const block of doc.blocks) {
    const text = textOf(block);
    if (!text) continue;
    for (const rule of RULES) {
      const matches = text.match(rule.pattern);
      if (!matches) continue;
      for (const m of matches) {
        const value = m.trim();
        if (value && !entries.some((e) => e.value === value)) {
          entries.push({ key: rule.key, value });
        }
      }
    }
  }

  if (entries.length === 0) return null;

  return {
    id: blockId(),
    type: "keyValue",
    bbox: { left: 0, top: 0, width: 0, height: 0 },
    source: "user",
    entries: entries.slice(0, 50),
  };
}

function textOf(block: Block): string | null {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "seal":
    case "formula":
      return block.text;
    case "table":
      // 票据的核心字段（金额/日期/号码）大多在表格单元格里
      return block.table.cells.map((c) => c.text).join("\n");
    case "keyValue":
      return block.entries.map((e) => `${e.key}: ${e.value}`).join("\n");
    default:
      return null;
  }
}
