"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Block } from "@/lib/normalize/types";

/**
 * 左侧原图面板：缩放 + 块定位框叠加。
 * 点击定位框选中对应文档块；选中块朱框高亮。
 */
export default function ImagePane({
  taskId,
  imageWidth,
  imageHeight,
  blocks,
  selectedId,
  onSelect,
}: {
  taskId: string;
  imageWidth: number;
  imageHeight: number;
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1); // 1 = 适配面板宽度
  const [scale, setScale] = useState(0); // 渲染像素 / 原图像素

  const measure = useCallback(() => {
    if (imgRef.current && imageWidth > 0) {
      setScale(imgRef.current.clientWidth / imageWidth);
    }
  }, [imageWidth]);

  useEffect(() => {
    measure();
  }, [measure, zoom]);

  // 容器尺寸变化时重新测量
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const boxes = blocks.filter(
    (b) => b.bbox.width > 0 && b.bbox.height > 0 && scale > 0,
  );

  return (
    <section
      aria-label="原图对照"
      className="flex min-w-0 flex-col border-r border-line bg-paper"
    >
      <header className="flex items-center justify-between border-b border-line bg-card px-4 py-2.5 text-[12.5px] font-semibold text-ink-3">
        <span>
          原图 · {imageWidth} × {imageHeight}
        </span>
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-paper p-0.5">
          <button
            type="button"
            aria-label="缩小"
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.25).toFixed(2)))}
            className="grid size-6 place-items-center rounded-md text-ink-2 hover:bg-line"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-11 text-center font-mono text-xs tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="grid size-6 place-items-center rounded-md text-ink-2 hover:bg-line"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="scroll-thin flex-1 overflow-auto p-6"
        onClick={() => onSelect(null)}
      >
        <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地原图，无需优化 */}
          <img
            ref={imgRef}
            src={`/api/tasks/${taskId}/image`}
            alt="任务原图"
            draggable={false}
            onLoad={measure}
            className="block w-full select-none rounded border border-line-strong bg-white shadow-lift"
          />
          {boxes.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-label={`定位块 ${b.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(b.id === selectedId ? null : b.id);
              }}
              className={`ov-box ${b.id === selectedId ? "ov-sel" : ""}`}
              style={{
                left: b.bbox.left * scale,
                top: b.bbox.top * scale,
                width: b.bbox.width * scale,
                height: b.bbox.height * scale,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
