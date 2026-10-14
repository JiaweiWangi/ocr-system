"use client";

import type { Block } from "@/lib/normalize/types";
import { TextBlockEditor } from "./TextBlockEditor";
import { TableGridEditor } from "./TableGridEditor";
import { KeyValuePanel } from "./KeyValuePanel";

/**
 * 块列表：每块一个卡片，按类型分派到对应编辑器。
 * 支持删除块、修改标题级别、上下移动。
 */

const TYPE_ICON: Record<string, string> = {
  heading: "H",
  paragraph: "¶",
  table: "▦",
  figure: "🖼",
  seal: "🔴",
  formula: "∑",
  keyValue: "🔑",
};

const TYPE_LABEL: Record<string, string> = {
  heading: "标题",
  paragraph: "段落",
  table: "表格",
  figure: "图片",
  seal: "印章",
  formula: "公式",
  keyValue: "关键信息",
};

interface Props {
  blocks: Block[];
  activeBlockId: string | null;
  onActivate: (id: string | null) => void;
  onChangeBlock: (id: string, next: Block) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: -1 | 1) => void;
}

export function BlockList({
  blocks,
  activeBlockId,
  onActivate,
  onChangeBlock,
  onDeleteBlock,
  onMoveBlock,
}: Props) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        没有识别到内容块
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const isActive = activeBlockId === block.id;
        return (
          <div
            key={block.id}
            onClick={() => onActivate(block.id)}
            className={`rounded-lg border p-3 transition-colors ${
              isActive ? "border-primary/60 bg-primary/[0.03]" : "hover:border-muted-foreground/30"
            }`}
          >
            {/* 块头 */}
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-muted font-mono text-[11px]">
                {TYPE_ICON[block.type]}
              </span>
              <span>{TYPE_LABEL[block.type]}</span>

              {block.type === "heading" && (
                <select
                  value={block.level ?? 1}
                  onChange={(e) =>
                    onChangeBlock(block.id, {
                      ...block,
                      level: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className="rounded border bg-transparent px-1 py-0.5"
                >
                  <option value={1}>H1</option>
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                </select>
              )}

              <span className="ml-auto flex items-center gap-0.5">
                <button
                  title="上移"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveBlock(block.id, -1);
                  }}
                  className="rounded px-1.5 hover:bg-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  title="下移"
                  disabled={index === blocks.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveBlock(block.id, 1);
                  }}
                  className="rounded px-1.5 hover:bg-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  title="删除块"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBlock(block.id);
                  }}
                  className="rounded px-1.5 text-destructive hover:bg-muted"
                >
                  ✕
                </button>
              </span>
            </div>

            {/* 块体 */}
            {block.type === "table" ? (
              <TableGridEditor
                table={block.table}
                onChange={(table) => onChangeBlock(block.id, { ...block, table })}
              />
            ) : block.type === "keyValue" ? (
              <KeyValuePanel
                entries={block.entries}
                onChange={(entries) => onChangeBlock(block.id, { ...block, entries })}
              />
            ) : block.type === "figure" ? (
              <input
                value={block.caption ?? ""}
                onChange={(e) => onChangeBlock(block.id, { ...block, caption: e.target.value })}
                placeholder="图片说明（可选）"
                className="w-full rounded border bg-transparent px-2 py-1.5 text-sm italic text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            ) : (
              <TextBlockEditor
                block={block}
                onChange={(next) => onChangeBlock(block.id, next)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
