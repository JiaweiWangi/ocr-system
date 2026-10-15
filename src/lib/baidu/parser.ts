import { callOcrApi } from "./client";

/**
 * 文档解析（异步 submit + poll），承担版面分析能力
 * 文档: https://ai.baidu.com/ai-doc/OCR/Klxag8wiy
 * 免费档：提交 QPS 2 / 查询 QPS 10，200 页/月
 *
 * 提交参数：file_data（base64，≤10M）+ file_name（必须带正确扩展名）。
 * 查询参数：task_id；result.status ∈ pending / running / success / failed，
 * 成功后返回 parse_result_url（临时 URL），需立即下载存档。
 * 版面类型 layouts[].type: text / table / title / formula / image / seal /
 * header / footer / number / contents 等；sub_type 细分 wired_table /
 * wireless_table / doc_title / title{n} 等。
 */

export interface ParserLayout {
  type: string;
  sub_type?: string;
  bbox?: number[]; // [left, top, width, height]
}

export interface ParserSubmitResult {
  result?: {
    task_id?: string; // 后续轮询用
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ParserQueryResult {
  result?: {
    status?: string; // pending | running | success | failed
    task_id?: string;
    parse_result_url?: string; // 处理完成后返回，临时 URL
    task_error?: string; // 失败原因
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** 提交文档解析任务，返回 task_id */
export async function parserSubmit(fileData: string, fileName: string): Promise<string> {
  const data = await callOcrApi("/rest/2.0/brain/online/v2/parser/task", {
    file_data: fileData,
    file_name: fileName,
  });
  const r = data as unknown as ParserSubmitResult;
  if (!r.result?.task_id) {
    throw new Error(
      `文档解析提交失败: ${JSON.stringify(r).slice(0, 200)}`,
    );
  }
  return r.result.task_id;
}

/** 查询任务状态。status: success=完成 failed=失败，其余为进行中 */
export async function parserQuery(taskId: string): Promise<ParserQueryResult["result"]> {
  const data = await callOcrApi("/rest/2.0/brain/online/v2/parser/task/query", {
    task_id: taskId,
  });
  return (data as unknown as ParserQueryResult).result;
}

/** 下载 parse_result_url 指向的 JSON（临时链接，成功后立即下载存档） */
export async function downloadParseResult(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载 parse_result 失败: HTTP ${res.status}`);
  return res.json();
}

export const PARSER_DONE = "success";
export const PARSER_FAILED = "failed";
