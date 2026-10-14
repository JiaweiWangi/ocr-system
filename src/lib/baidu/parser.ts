import { callOcrApi } from "./client";

/**
 * 文档解析（异步 submit + poll），承担版面分析能力
 * 文档: https://cloud.baidu.com/doc/OCR/s/Klxag8wiy
 * 免费档：提交 QPS 2 / 查询 QPS 10，200 页/月
 *
 * 版面类型 layouts[].type: text / table / title / formula / image / seal /
 * header / footer / number / contents 等；sub_type 细分 wired_table /
 * wireless_table / doc_title / title{n} 等。
 * 成功后返回 parse_result_url（临时 URL），需立即下载存档。
 */

export interface ParserLayout {
  type: string;
  sub_type?: string;
  bbox?: number[]; // [left, top, width, height]
}

export interface ParserSubmitResult {
  code?: number;
  message?: string;
  result?: {
    task_id?: string; // 后续轮询用
    [key: string]: unknown;
  };
}

export interface ParserQueryResult {
  code?: number;
  message?: string;
  result?: {
    ret_code?: number; // 0=创建 1=排队中 2=处理中 3=处理完成 4=失败
    task_id?: string;
    parse_result_url?: string; // 处理完成后返回，临时 URL
    [key: string]: unknown;
  };
}

/** 提交文档解析任务，返回 task_id */
export async function parserSubmit(imageBase64: string): Promise<string> {
  const data = await callOcrApi("/rest/2.0/brain/online/v2/parser/task", {
    image: imageBase64,
    request_type: "image",
  });
  const r = data as unknown as ParserSubmitResult;
  if (r.code !== 0 || !r.result?.task_id) {
    throw new Error(`文档解析提交失败: ${r.message ?? JSON.stringify(r)}`);
  }
  return r.result.task_id;
}

/** 查询任务状态。ret_code: 3=完成 4=失败，其余为进行中 */
export async function parserQuery(taskId: string): Promise<ParserQueryResult["result"]> {
  const data = await callOcrApi("/rest/2.0/brain/online/v2/parser/task/query", {
    task_id: taskId,
  });
  const r = data as unknown as ParserQueryResult;
  return r.result;
}

/** 下载 parse_result_url 指向的 JSON（临时链接，成功后立即下载存档） */
export async function downloadParseResult(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载 parse_result 失败: HTTP ${res.status}`);
  return res.json();
}

export const PARSER_DONE = 3;
export const PARSER_FAILED = 4;
