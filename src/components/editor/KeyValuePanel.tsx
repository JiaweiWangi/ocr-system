"use client";

import type { KeyValueEntry } from "@/lib/normalize/types";

/**
 * 关键信息面板：key-value 可编辑列表，支持增删条目。
 */

interface Props {
  entries: KeyValueEntry[];
  onChange: (entries: KeyValueEntry[]) => void;
}

export function KeyValuePanel({ entries, onChange }: Props) {
  function update(i: number, patch: Partial<KeyValueEntry>) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={entry.key}
            onChange={(e) => update(i, { key: e.target.value })}
            className="w-24 shrink-0 rounded border bg-transparent px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-primary/40"
          />
          <input
            value={entry.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            title="删除条目"
            onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
            className="shrink-0 rounded px-1 text-xs text-destructive hover:bg-muted"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...entries, { key: "", value: "" }])}
        className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        + 添加条目
      </button>
    </div>
  );
}
