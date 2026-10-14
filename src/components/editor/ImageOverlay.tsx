"use client";

import { useRef, useState } from "react";
import type { Block } from "@/lib/normalize/types";

/**
 * 原图 + bbox 叠加高亮：hover/选中与右侧块列表联动。
 */

const TYPE_COLOR: Record<string, string> = {
  heading: "rgba(59,130,246,0.25)", // 蓝
  paragraph: "rgba(34,197,94,0.2)", // 绿
  table: "rgba(168,85,247,0.25)", // 紫
  figure: "rgba(234,179,8,0.25)", // 黄
  seal: "rgba(239,68,68,0.3)", // 红
  formula: "rgba(14,165,233,0.25)", // 天蓝
  keyValue: "rgba(244,114,182,0.25)", // 粉
};

interface Props {
  taskId: string;
  imageWidth: number;
  imageHeight: number;
  blocks: Block[];
  activeBlockId: string | null;
}

export function ImageOverlay({ taskId, imageWidth, imageHeight, blocks, activeBlockId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const scale = displaySize ? displaySize.w / (imageWidth || displaySize.w) : 0;

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (el && !displaySize) {
          setDisplaySize({ w: el.clientWidth, h: el.clientHeight });
        }
      }}
      className="relative overflow-hidden rounded-lg border bg-muted/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/tasks/${taskId}/image`}
        alt="原图"
        className="block w-full select-none"
        onLoad={(e) => {
          const img = e.currentTarget;
          setDisplaySize({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      {scale > 0 &&
        blocks.map((block) => {
          const { left, top, width, height } = block.bbox;
          if (width === 0 && height === 0) return null; // 无坐标的块不叠加
          const isActive = activeBlockId === block.id || hoverId === block.id;
          return (
            <div
              key={block.id}
              title={block.type}
              onMouseEnter={() => setHoverId(block.id)}
              onMouseLeave={() => setHoverId(null)}
              className="absolute cursor-pointer border transition-opacity"
              style={{
                left: `${(left / imageWidth) * 100}%`,
                top: `${(top / imageHeight) * 100}%`,
                width: `${(width / imageWidth) * 100}%`,
                height: `${(height / imageHeight) * 100}%`,
                background: TYPE_COLOR[block.type] ?? "rgba(128,128,128,0.2)",
                borderColor: isActive ? "rgb(59,130,246)" : "transparent",
                borderWidth: isActive ? 2 : 0,
                opacity: isActive ? 0.9 : 0.55,
              }}
            />
          );
        })}
    </div>
  );
}
