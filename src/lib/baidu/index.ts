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
  signal?: AbortSignal,
): Promise<GeneralResult> {
  signal?.throwIfAborted();
  if (isMockMode()) {
    const engine = precision === "high" ? "accurate" : "general";
    return loadFixture(engine, imageKeyFromName(fileName)) as Promise<GeneralResult>;
  }
  const result = await (precision === "high" ? accurateOcr(imageBase64, signal) : generalOcr(imageBase64, signal));
  if (!Array.isArray(result.words_result)) throw new Error("文字识别响应格式异常");
  return result;
}

export async function runTable(
  imageBase64: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<TableV2Result> {
  signal?.throwIfAborted();
  if (isMockMode()) {
    return loadFixture("table", imageKeyFromName(fileName)) as Promise<TableV2Result>;
  }
  const result = await tableOcr(imageBase64, signal);
  if (!Array.isArray(result.tables_result)) throw new Error("表格识别响应格式异常");
  return result;
}

export async function runParserSubmit(
  _imageBase64: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (isMockMode()) {
    void fileName; // mock 不区分图片，统一 default 生命周期
    return mockParserSubmit();
  }
  // 真实调用：file_name 必须带正确扩展名（title 可编辑不可靠，取落盘文件名）
  return parserSubmit(_imageBase64, fileName, signal);
}

/** 返回查询结果；完成时同时返回已下载的 parse_result */
export async function runParserPoll(
  taskId: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<{ status: string; parseResult?: unknown }> {
  signal?.throwIfAborted();
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

  const r = await parserQuery(taskId, signal);
  const status = r?.status ?? "unknown";
  if (!["pending", "running", PARSER_DONE, PARSER_FAILED].includes(status)) {
    throw new Error("文档解析返回了未知状态");
  }
  if (status === PARSER_DONE) {
    if (!r?.parse_result_url) throw new Error("文档解析完成但未返回结果地址");
    return { status, parseResult: await downloadParseResult(r.parse_result_url, signal) };
  }
  return { status };
}
