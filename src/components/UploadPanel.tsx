"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { fetchJson, MODE_DESC, MODE_LABEL, type TaskMode } from "@/lib/client/api";
import { MAX_IMAGE_BYTES, IMAGE_MIME_TYPES } from "@/lib/uploadLimits";

const MODES: TaskMode[] = ["general", "table", "deep"];

/**
 * 上传面板：拖拽/点击选图 + 模式胶囊分段器 + 精度开关（仅通用模式）
 */
export default function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TaskMode>("general");
  const [highPrecision, setHighPrecision] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: File) {
    setError(null);
    if (!IMAGE_MIME_TYPES.includes(file.type)) {
      setError("仅支持图片文件（PNG / JPG / BMP / WebP）");
      return;
    }
    if (!file.size) {
      setError("图片不能为空");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片过大（>6MB），请压缩后重试");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("image", file);
      form.set("mode", mode);
      if (mode === "general") {
        form.set("precision", highPrecision ? "high" : "standard");
      }
      form.set("title", file.name);
      const { id } = await fetchJson<{ id: string }>("/api/tasks", {
        method: "POST",
        body: form,
      });
      router.push(`/tasks/${id}`);
    } catch (err) {
      setError(err instanceof Error && err.name === "TimeoutError"
        ? "上传请求超时，请先查看历史记录确认是否已创建任务"
        : err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !uploading) void submit(file);
  }

  return (
    <div>
      <div className="rounded-[14px] bg-card p-2.5 shadow-card">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`w-full rounded-[10px] border-2 border-dashed px-6 py-10 text-center transition-all duration-150 ease-out ${
            dragging
              ? "border-red bg-red-wash"
              : "border-line-strong hover:border-red hover:bg-red-wash"
          } disabled:cursor-not-allowed disabled:opacity-60`}
          aria-label="上传图片"
        >
          {uploading ? (
            <>
              <Loader2 className="mx-auto mb-3 size-11 animate-spin text-red" strokeWidth={1.6} />
              <p className="font-serif text-base font-bold tracking-[0.05em] text-ink">
                正在上传…
              </p>
            </>
          ) : (
            <>
              <span className="mx-auto mb-3 grid size-11 place-items-center rounded-[14px] bg-red-wash text-red">
                <Upload className="size-5" strokeWidth={1.8} />
              </span>
              <p className="font-serif text-base font-bold tracking-[0.05em] text-ink">
                拖入图片，或点击选择文件
              </p>
              <p className="mt-1 text-[12.5px] text-ink-3">PNG / JPG / BMP / WebP · 最大 6MB</p>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/bmp,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void submit(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* 模式胶囊分段器 */}
      <div
        role="radiogroup"
        aria-label="识别模式"
        className="mx-auto mt-4 flex w-max gap-1.5 rounded-full bg-card p-1 shadow-card"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-5 py-2 text-[13.5px] font-semibold transition-all duration-150 ease-out ${
              mode === m ? "bg-ink text-white" : "text-ink-2 hover:bg-paper"
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-center text-[12.5px] text-ink-3">
        {mode === "general" ? (
          <>
            当前：
            <button
              type="button"
              onClick={() => setHighPrecision((v) => !v)}
              className={`mx-1 font-semibold underline decoration-dotted underline-offset-4 transition-colors ${
                highPrecision ? "text-red" : "text-ink-3 hover:text-ink"
              }`}
            >
              {highPrecision ? "高精度" : "标准"}
            </button>
            （点击切换）· {MODE_DESC[mode]}
          </>
        ) : (
          <>当前：{MODE_LABEL[mode]} —— {MODE_DESC[mode]}</>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-[10px] bg-red-wash px-4 py-2.5 text-center text-[13px] font-medium text-red-deep">
          {error}
        </p>
      )}
    </div>
  );
}
