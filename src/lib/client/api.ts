import type { OcrDocument } from "@/lib/normalize/types";

/** 任务识别模式 */
export type TaskMode = "general" | "table" | "deep";
/** 任务状态 */
export type TaskStatus = "pending" | "processing" | "success" | "failed";
/** general 模式精度子选项 */
export type Precision = "standard" | "high";

export interface TaskSummary {
  id: string;
  title: string;
  mode: TaskMode;
  precision?: Precision;
  status: TaskStatus;
  imagePath: string;
  createdAt: string;
  error: string | null;
}

export interface VersionInfo {
  id: string;
  versionNo: number;
  label: string | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface TaskDetail {
  task: TaskSummary & {
    precision: Precision;
    imageWidth: number | null;
    imageHeight: number | null;
    originalImagePath: string | null;
    preprocessing: string | null;
    updatedAt: string;
    versions: VersionInfo[];
  };
  content: OcrDocument | null;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(url, { ...init, signal });
    const body = await res.json().catch((error) => {
      if (signal.aborted) throw error;
      return null;
    });
    if (!res.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : `请求失败（${res.status}）`);
    }
    if (body === null) throw new Error("服务器返回的数据无效，请稍后重试");
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new DOMException("请求超时，请稍后重试", "TimeoutError");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const MODE_LABEL: Record<TaskMode, string> = {
  general: "通用文字",
  table: "表格识别",
  deep: "深度解析",
};

export const MODE_DESC: Record<TaskMode, string> = {
  general: "适合拍照文档、扫描件、海报，秒级同步返回",
  table: "适合表格截图、票据，还原合并单元格与表外文字",
  deep: "适合试卷、多栏图文混排，版面级结构化，约 30–60 秒",
};

export const PRECISION_LABEL: Record<Precision, string> = {
  standard: "标准",
  high: "高精度",
};

export function statusLabel(status: TaskStatus, mode: TaskMode): string {
  switch (status) {
    case "pending":
      return "排队中";
    case "processing":
      return mode === "deep" ? "解析中" : "识别中";
    case "success":
      return "识别完成";
    case "failed":
      return "识别失败";
  }
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
