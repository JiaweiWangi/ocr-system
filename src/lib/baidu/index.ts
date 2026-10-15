import { generalOcr, accurateOcr, type GeneralResult } from "./general";
import { tableOcr, type TableV2Result } from "./table";
import {
  parserSubmit,
  parserQuery,
  downloadParseResult,
  PARSER_DONE,
  PARSER_FAILED,
} from "./parser";
import {
  isMockMode,
  loadFixture,
  imageKeyFromName,
  mockParserSubmit,
  mockParserQuery,
} from "./fixtures";

/**
 * 百度 OCR 对外门面：pipeline 只 import 这里。
 * BAIDU_MOCK=1 时走 fixtures 回放，否则真实调用。
 */

export type { GeneralResult, TableV2Result };
export { PARSER_DONE, PARSER_FAILED };

export async function runGeneral(
  imageBase64: string,
  fileName: string,
  precision: "standard" | "high" = "standard",
): Promise<GeneralResult> {
  if (isMockMode()) {
    const engine = precision === "high" ? "accurate" : "general";
    return loadFixture(engine, imageKeyFromName(fileName)) as Promise<GeneralResult>;
  }
  return precision === "high" ? accurateOcr(imageBase64) : generalOcr(imageBase64);
}

export async function runTable(
  imageBase64: string,
  fileName: string,
): Promise<TableV2Result> {
  if (isMockMode()) {
    return loadFixture("table", imageKeyFromName(fileName)) as Promise<TableV2Result>;
  }
  return tableOcr(imageBase64);
}

export async function runParserSubmit(
  _imageBase64: string,
  fileName: string,
): Promise<string> {
  if (isMockMode()) {
    void fileName; // mock 不区分图片，统一 default 生命周期
    return mockParserSubmit();
  }
  // 真实调用：file_name 必须带正确扩展名（title 可编辑不可靠，取落盘文件名）
  return parserSubmit(_imageBase64, fileName);
}

/** 返回查询结果；完成时同时返回已下载的 parse_result */
export async function runParserPoll(
  taskId: string,
  fileName: string,
): Promise<{ status: string; parseResult?: unknown }> {
  if (isMockMode()) {
    const r = mockParserQuery(taskId);
    if (r.status === PARSER_DONE) {
      return {
        status: PARSER_DONE,
        parseResult: await loadFixture("parser", imageKeyFromName(fileName)),
      };
    }
    return { status: r.status };
  }

  const r = await parserQuery(taskId);
  const status = r?.status ?? "unknown";
  if (status === PARSER_DONE && r?.parse_result_url) {
    return { status, parseResult: await downloadParseResult(r.parse_result_url) };
  }
  return { status };
}
