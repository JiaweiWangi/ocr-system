"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 导出菜单：txt / md / docx / xlsx 四种格式，直接下载当前版本。
 */

const FORMATS: { value: string; label: string; desc: string }[] = [
  { value: "txt", label: "TXT", desc: "纯文本，表格用制表符分隔" },
  { value: "md", label: "Markdown", desc: "标题/段落/表格（HTML 表格支持合并单元格）" },
  { value: "docx", label: "Word (docx)", desc: "保留标题层级与表格结构" },
  { value: "xlsx", label: "Excel (xlsx)", desc: "每个表格一个工作表" },
];

export function ExportMenu({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        导出下载 ▾
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-md border bg-background shadow-lg">
            {FORMATS.map((f) => (
              <a
                key={f.value}
                href={`/api/tasks/${taskId}/export?format=${f.value}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
