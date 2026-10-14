"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TaskItem {
  id: string;
  title: string;
  mode: string;
  status: string;
  imagePath: string;
  createdAt: string;
  error: string | null;
}

const MODE_LABEL: Record<string, string> = {
  general: "通用",
  table: "表格",
  deep: "深度",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "等待中",
  processing: "识别中",
  success: "已完成",
  failed: "失败",
};

export function HistoryList({ tasks }: { tasks: TaskItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));

  async function remove(id: string) {
    if (!confirm("确定删除这个任务？识别结果将一并删除")) return;
    setDeleting(id);
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  async function rerun(id: string, mode?: string) {
    await fetch(`/api/tasks/${id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode ? { mode } : {}),
    });
    router.push(`/tasks/${id}`);
  }

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索任务标题…"
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="divide-y rounded-lg border">
        {filtered.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{t.title}</span>
                <Badge variant="secondary">{MODE_LABEL[t.mode] ?? t.mode}</Badge>
                <span
                  className={`text-xs ${
                    t.status === "failed"
                      ? "text-destructive"
                      : t.status === "success"
                        ? "text-green-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {t.error ?? new Date(t.createdAt).toLocaleString("zh-CN")}
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              {t.status === "failed" && (
                <Button variant="ghost" size="sm" onClick={() => rerun(t.id)}>
                  重试
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={deleting === t.id}
                onClick={() => remove(t.id)}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            没有匹配的任务
          </div>
        )}
      </div>
    </div>
  );
}
