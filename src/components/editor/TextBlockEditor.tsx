"use client";

import type { TextBlock, ReadOnlyTextBlock } from "@/lib/normalize/types";

/**
 * 文本块编辑器：textarea 直编。
 * formula/seal 块提示只读来源，但仍允许修正（识别结果可能不准）。
 */

interface Props {
  block: TextBlock | ReadOnlyTextBlock;
  onChange: (next: TextBlock | ReadOnlyTextBlock) => void;
}

export function TextBlockEditor({ block, onChange }: Props) {
  const isHeading = block.type === "heading";
  return (
    <textarea
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="（空）"
      rows={Math.max(2, Math.min(12, Math.ceil(block.text.length / 40) || 2))}
      className={`w-full resize-y rounded border bg-transparent p-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary/40 ${
        isHeading ? "font-semibold" : ""
      }`}
    />
  );
}
