"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { preprocessImage } from "./preprocess";

export type Mode = "general" | "table" | "deep";
export type Precision = "standard" | "high";

const MODES: {
  value: Mode;
  title: string;
  desc: string;
  examples: string;
}[] = [
  {
    value: "general",
    title: "通用模式",
    desc: "通用文字识别，速度快、额度足。可切换高精度版（模糊照片更准）",
    examples: "拍照文档 · 扫描件 · 宣传海报",
  },
  {
    value: "table",
    title: "表格模式",
    desc: "表格识别 V2，还原表格结构（含合并单元格），附带识别表外文字",
    examples: "表格截图 · 票据单据",
  },
  {
    value: "deep",
    title: "深度模式",
    desc: "文档解析，完整版面分析（标题/段落/表格/图片/印章分类）",
    examples: "试卷 · 多栏文档 · 图文混排",
  },
];

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("general");
  const [precision, setPrecision] = useState<Precision>("standard");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const processed = await preprocessImage(file);
        const form = new FormData();
        form.append("image", processed);
        form.append("mode", mode);
        form.append("precision", precision);
        form.append("title", file.name);

        const res = await fetch("/api/tasks", { method: "POST", body: form });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          throw new Error(data.error ?? "上传失败");
        }
        router.push(`/tasks/${data.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "上传失败");
        setBusy(false);
      }
    },
    [mode, precision, router],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void upload(file);
    },
    [upload],
  );

  return (
    <div className="space-y-4">
      {/* 模式选择 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              mode === m.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="font-medium">{m.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{m.desc}</div>
            <div className="mt-2 text-xs text-muted-foreground/70">{m.examples}</div>
          </button>
        ))}
      </div>

      {mode === "general" && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">识别精度：</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="precision"
              checked={precision === "standard"}
              onChange={() => setPrecision("standard")}
            />
            标准（1000 次/月）
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="precision"
              checked={precision === "high"}
              onChange={() => setPrecision("high")}
            />
            高精度（500 次/月）
          </label>
        </div>
      )}

      {/* 拖拽区 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => onFiles(e.clipboardData.files)}
        className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
        }`}
      >
        {busy ? (
          <div className="space-y-2">
            <div className="text-muted-foreground">正在预处理并上传…</div>
          </div>
        ) : (
          <>
            <div className="text-4xl">📄</div>
            <div className="mt-3 font-medium">拖拽图片到这里，或点击选择文件</div>
            <div className="mt-1 text-sm text-muted-foreground">
              也可以直接 Ctrl/⌘+V 粘贴截图 · 支持 JPG/PNG/WebP/BMP · 自动压缩至 4MB
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="text-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => router.push("/history")}
        >
          查看全部历史记录 →
        </Button>
      </div>
    </div>
  );
}
