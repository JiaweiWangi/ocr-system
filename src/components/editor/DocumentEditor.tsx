"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Block, OcrDocument } from "@/lib/normalize/types";
import { extractKeyInfo } from "@/lib/kie/extract";
import { ImageOverlay } from "./ImageOverlay";
import { BlockList } from "./BlockList";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * 编辑器容器：三栏布局（原图叠加 / 块列表）。
 * - 所有编辑在本地 state 完成，debounce 800ms 自动保存到当前版本
 * - 撤销/重做用前端命令栈（快照式，不入库）
 * - 版本快照/回滚走 versions API
 */

interface Props {
  taskId: string;
  title: string;
  mode: string;
  initialDoc: OcrDocument;
  imageWidth: number;
  imageHeight: number;
  versions: { versionNo: number; label: string | null; isCurrent: boolean }[];
}

interface VersionInfo {
  versionNo: number;
  label: string | null;
  isCurrent: boolean;
}

export function DocumentEditor({
  taskId,
  title,
  mode,
  initialDoc,
  imageWidth,
  imageHeight,
  versions: initialVersions,
}: Props) {
  const [doc, setDoc] = useState<OcrDocument>(initialDoc);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [versions, setVersions] = useState<VersionInfo[]>(initialVersions);

  // ---- 撤销/重做（快照栈） ----
  const undoStack = useRef<OcrDocument[]>([]);
  const redoStack = useRef<OcrDocument[]>([]);
  const lastDoc = useRef(initialDoc);

  const applyDoc = useCallback(
    (next: OcrDocument, recordHistory = true) => {
      if (recordHistory) {
        undoStack.current.push(lastDoc.current);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
      }
      lastDoc.current = next;
      setDoc(next);
      setSaveState("dirty");
    },
    [],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(lastDoc.current);
    lastDoc.current = prev;
    setDoc(prev);
    setSaveState("dirty");
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(lastDoc.current);
    lastDoc.current = next;
    setDoc(next);
    setSaveState("dirty");
  }, []);

  // ---- debounce 自动保存 ----
  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/tasks/${taskId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [doc, saveState, taskId]);

  // ---- 键盘快捷键 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.key === "y") ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- 块操作 ----
  const changeBlock = useCallback(
    (id: string, next: Block) => {
      applyDoc({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? next : b)) });
    },
    [doc, applyDoc],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      applyDoc({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) });
    },
    [doc, applyDoc],
  );

  const moveBlock = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = doc.blocks.findIndex((b) => b.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= doc.blocks.length) return;
      const blocks = [...doc.blocks];
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      applyDoc({ ...doc, blocks });
    },
    [doc, applyDoc],
  );

  // ---- KIE ----
  const runKie = useCallback(() => {
    const existing = doc.blocks.find((b) => b.type === "keyValue");
    if (existing) {
      // 已有关键信息块：先移除再重提取
      const without = { ...doc, blocks: doc.blocks.filter((b) => b.type !== "keyValue") };
      const kv = extractKeyInfo(without);
      if (kv) {
        applyDoc({ ...without, blocks: [...without.blocks, kv] });
      } else {
        applyDoc(without);
      }
    } else {
      const kv = extractKeyInfo(doc);
      if (kv) applyDoc({ ...doc, blocks: [...doc.blocks, kv] });
      else alert("未提取到关键信息（日期/金额/号码等）");
    }
  }, [doc, applyDoc]);

  // ---- 版本操作 ----
  async function snapshot() {
    const label = prompt("快照名称", `快照 v${versions.length + 1}`);
    if (label === null) return;
    const res = await fetch(`/api/tasks/${taskId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) await refreshVersions();
  }

  async function restore(versionNo: number) {
    if (!confirm(`回滚到 v${versionNo}？当前内容会被保存为新版本`)) return;
    const res = await fetch(`/api/tasks/${taskId}/versions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionNo }),
    });
    if (res.ok) {
      const detail = await fetch(`/api/tasks/${taskId}`).then((r) => r.json());
      if (detail.content) applyDoc(detail.content, false);
      await refreshVersions();
    }
  }

  async function refreshVersions() {
    const res = await fetch(`/api/tasks/${taskId}/versions`);
    const data = (await res.json()) as { versions: VersionInfo[] };
    setVersions(data.versions);
  }

  const hasKvBlock = doc.blocks.some((b) => b.type === "keyValue");

  return (
    <main className="flex min-h-screen flex-col">
      {/* 顶部工具条 */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ←
        </Link>
        <span className="max-w-48 truncate text-sm font-semibold">{title}</span>
        <Badge variant="secondary">
          {{ general: "通用", table: "表格", deep: "深度" }[mode] ?? mode}
        </Badge>

        <span className="ml-1 text-xs text-muted-foreground">
          {saveState === "saved" && "✓ 已保存"}
          {saveState === "saving" && "保存中…"}
          {saveState === "dirty" && "• 未保存"}
          {saveState === "error" && (
            <span className="text-destructive">保存失败（网络错误）</span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={undo} title="⌘Z">
            撤销
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} title="⌘⇧Z">
            重做
          </Button>
          <Button variant="outline" size="sm" onClick={runKie}>
            {hasKvBlock ? "重新提取" : "提取关键信息"}
          </Button>
          <Button variant="outline" size="sm" onClick={snapshot}>
            保存版本
          </Button>
          <ExportMenu taskId={taskId} />
        </div>
      </header>

      {/* 主体两栏 */}
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-2">
        <div className="lg:sticky lg:top-16 lg:self-start">
          <ImageOverlay
            taskId={taskId}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            blocks={doc.blocks}
            activeBlockId={activeBlockId}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            颜色：🟦标题 🟩段落 🟪表格 🟨图片 🟥印章
          </p>
        </div>
        <div className="space-y-3">
          <BlockList
            blocks={doc.blocks}
            activeBlockId={activeBlockId}
            onActivate={setActiveBlockId}
            onChangeBlock={changeBlock}
            onDeleteBlock={deleteBlock}
            onMoveBlock={moveBlock}
          />

          {/* 版本栏 */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              版本历史（{versions.length}）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {versions.map((v) => (
                <button
                  key={v.versionNo}
                  onClick={() => restore(v.versionNo)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    v.isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                  title={v.isCurrent ? "当前版本" : "点击回滚到此版本"}
                >
                  v{v.versionNo} {v.label ?? ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
