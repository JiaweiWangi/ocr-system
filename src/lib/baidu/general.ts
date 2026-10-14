import { callOcrApi } from "./client";

/**
 * 通用文字识别（标准/高精度含位置版）
 * 文档: https://cloud.baidu.com/doc/OCR/s/vk3h7y58v (general)
 *       https://cloud.baidu.com/doc/OCR/s/tk3h7y2aq (accurate)
 */

export interface GeneralWord {
  words: string;
  location: { left: number; top: number; width: number; height: number };
  probability?: { average: number; minimum: number; variance: number };
}

export interface GeneralResult {
  words_result: GeneralWord[];
  words_result_num: number;
  log_id: number;
  /** paragraph=true 时返回的段落分组 */
  paragraphs_result?: {
    words_result_idx: number[]; // 属于该段的行下标
  }[];
  paragraphs_result_num?: number;
  /** detect_direction=true 时返回的旋转角度 */
  direction?: number;
}

/** 通用文字识别（标准含位置版），免费 1000 次/月 */
export async function generalOcr(imageBase64: string): Promise<GeneralResult> {
  return (await callOcrApi("/rest/2.0/ocr/v1/general", {
    image: imageBase64,
    paragraph: "true",
    detect_direction: "true",
  })) as unknown as GeneralResult;
}

/** 通用文字识别（高精度含位置版），免费 500 次/月 */
export async function accurateOcr(imageBase64: string): Promise<GeneralResult> {
  return (await callOcrApi("/rest/2.0/ocr/v1/accurate", {
    image: imageBase64,
    paragraph: "true",
    detect_direction: "true",
  })) as unknown as GeneralResult;
}
