"use client";

import { AlertTriangle, ImageIcon, Plus } from "lucide-react";
import type {
  Block,
  KeyValueBlock,
  TextBlock,
  FigureBlock,
  ReadOnlyTextBlock,
} from "@/lib/normalize/types";
import Editable from "./Editable";
import TableGridEditor from "./TableGridEditor";

const TYPE_LABEL: Record<Block["type"], string> = {
  heading: "标题",
  paragraph: "段落",
  table: "表格",
  figure: "图片",
  seal: "印章",
  formula: "公式",
  keyValue: "键值",
};

/** 低置信阈值：低于此值显示赭色警示 */
const LOW_CONF = 0.85;

export function ConfTag({ value }: { value?: number }) {
  if (value === undefined) return null;
  const low = value < LOW_CONF;
  return (
    <span
      className={`ml-2 font-mono text-[11px] font-normal tracking-normal ${
        low ? "text-gold" : "text-ink-4"
      }`}
      title={low ? "置信度较低，请重点校对" : undefined}
    >
      {low && (
        <AlertTriangle className="mr-0.5 inline size-3 align-[-1px]" aria-label="低置信" />
      )}
      {value.toFixed(2)}
    </span>
  );
}

/**
 * 单个文档块的编辑视图。选中态 + 悬停删除 + 类型角标由 BlockList 统一处理，
 * 这里只负责按块类型渲染编辑控件。
 */
export default function BlockEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (next: Block) => void;
}) {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return <TextBlockView block={block} onChange={onChange} />;
    case "table":
      return <TableGridEditor table={block.table} onChange={(table) => onChange({ ...block, table })} />;
    case "figure":
      return <FigureView block={block} onChange={onChange} />;
    case "keyValue":
      return <KeyValueView block={block} onChange={onChange} />;
    case "seal":
    case "formula":
      return <ReadOnlyView block={block} />;
  }
}

function TextBlockView({
  block,
  onChange,
}: {
  block: TextBlock;
  onChange: (b: Block) => void;
}) {
  const isHeading = block.type === "heading";
  return (
    <Editable
      value={block.text}
      multiline
      placeholder={isHeading ? "标题" : "段落文字"}
      ariaLabel={isHeading ? "标题内容" : "段落内容"}
      onCommit={(text) => onChange({ ...block, text })}
      className={
        isHeading
          ? "mt-1.5 inline-block border-b-[3px] border-red pb-0.5 font-serif text-[19px] font-bold leading-snug tracking-[0.02em] text-ink"
          : "mt-1 font-serif text-[14.5px] leading-[1.8] text-ink-2"
      }
    />
  );
}

function FigureView({
  block,
  onChange,
}: {
  block: FigureBlock;
  onChange: (b: Block) => void;
}) {
  return (
    <div className="mt-1 flex items-start gap-2.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-paper text-ink-3">
        <ImageIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-ink-4">图片区域（图题可编辑）</p>
        <Editable
          value={block.caption ?? ""}
          placeholder="图题…"
          ariaLabel="图题"
          onCommit={(caption) => onChange({ ...block, caption })}
          className="font-serif text-[14px] text-ink-2"
        />
      </div>
    </div>
  );
}

function KeyValueView({
  block,
  onChange,
}: {
  block: KeyValueBlock;
  onChange: (b: Block) => void;
}) {
  function setEntries(entries: KeyValueBlock["entries"]) {
    onChange({ ...block, entries });
  }
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
      {block.entries.map((entry, i) => (
        <div key={i} className="contents">
          <dt className="text-[13px] font-semibold text-ink-3">
            <Editable
              value={entry.key}
              placeholder="字段"
              ariaLabel={`第 ${i + 1} 项字段名`}
              onCommit={(key) =>
                setEntries(block.entries.map((e, j) => (j === i ? { ...e, key } : e)))
              }
              className="text-[13px] font-semibold text-ink-3"
            />
          </dt>
          <dd className="border-b border-dashed border-line-strong pb-0.5">
            <Editable
              value={entry.value}
              placeholder="值"
              ariaLabel={`第 ${i + 1} 项值`}
              onCommit={(value) =>
                setEntries(block.entries.map((e, j) => (j === i ? { ...e, value } : e)))
              }
              className="font-serif text-[13.5px] text-ink-2"
            />
          </dd>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setEntries([...block.entries, { key: "", value: "" }])}
        className="col-start-2 mt-0.5 inline-flex w-max items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-3 hover:bg-paper hover:text-ink"
      >
        <Plus className="size-3" /> 添加字段
      </button>
    </dl>
  );
}

function ReadOnlyView({ block }: { block: ReadOnlyTextBlock }) {
  return (
    <div className="mt-1 flex items-baseline gap-2 rounded-lg bg-paper px-3 py-2">
      <span className="shrink-0 text-[11.5px] font-semibold tracking-widest text-ink-4">
        {block.type === "seal" ? "【印】" : "【式】"}
      </span>
      <p className="min-w-0 font-serif text-[14px] text-ink-2">{block.text || "（空）"}</p>
    </div>
  );
}

export { TYPE_LABEL };
