"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Download, Loader2, Plus, RotateCcw, X } from "lucide-react";
import type { Block, OcrDocument } from "@/lib/normalize/types";
import { blockId } from "@/lib/normalize/types";
import {
  fetchJson,
  MODE_LABEL,
  PRECISION_LABEL,
  type Precision,
  type TaskMode,
  type TaskDetail,
  type VersionInfo,
} from "@/lib/client/api";
import Menu from "@/components/Menu";
import ImagePane from "./ImagePane";
import BlockEditor, { ConfTag, TYPE_LABEL } from "./BlockEditor";

type SaveState = "saved" | "dirty" | "saving" | "error";

/**
 * 校对编辑器：左原图对照 / 右文档块流。
 * 拥有文档状态、自动保存（防抖 1.2s）、选中定位、版本快照与导出。
 */
export default function TaskEditor({
  data,
  onReload,
}: {
  data: TaskDetail;
  onReload: () => void;
}) {
  const { task } = data;
  const doc0 = data.content!; // 页面已保证非空

  const [title, setTitle] = useState(task.title);
  const [doc, setDoc] = useState<OcrDocument>(doc0);
  const [versions, setVersions] = useState<VersionInfo[]>(task.versions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string>("");

  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorKey, setEditorKey] = useState(0); // 回滚后强制重挂编辑区

  /** 标记脏 + 触发防抖保存 */
  const updateDoc = useCallback((next: OcrDocument) => {
    dirtyRef.current = true;
    setDoc(next);
    setSaveState("dirty");
  }, []);

  const updateBlock = useCallback(
    (block: Block) => {
      updateDoc({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === block.id ? block : b)),
      });
    },
    [updateDoc, doc],
  );

  // ── 自动保存 ──
  useEffect(() => {
    if (saveState !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await fetchJson(`/api/tasks/${task.id}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc),
        });
        dirtyRef.current = false;
        setSaveState("saved");
        setSavedAt(
          new Date().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" }),
        );
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, saveState, task.id]);

  // 离开页面前有未保存内容时提醒
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  // ── 题名 ──
  async function saveTitle(next: string) {
    if (next === task.title) return;
    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
    } catch {
      /* 题名保存失败不打断编辑 */
    }
  }

  // ── 块操作 ──
  function deleteBlock(id: string) {
    updateDoc({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function appendParagraph() {
    updateDoc({
      ...doc,
      blocks: [
        ...doc.blocks,
        {
          id: blockId(),
          type: "paragraph",
          text: "",
          bbox: { left: 0, top: 0, width: 0, height: 0 },
          source: "user",
        },
      ],
    });
  }

  // ── 版本 ──
  async function refreshVersions() {
    try {
      const { versions } = await fetchJson<{ versions: VersionInfo[] }>(
        `/api/tasks/${task.id}/versions`,
      );
      setVersions(versions);
    } catch {
      /* 刷新失败保留旧列表 */
    }
  }

  async function snapshot(label: string) {
    await fetchJson(`/api/tasks/${task.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || undefined }),
    });
    await refreshVersions();
  }

  async function rollback(versionNo: number) {
    if (!window.confirm(`回滚到 v${versionNo}？当前内容会存为新版本，历史不会丢失。`)) return;
    await fetchJson(`/api/tasks/${task.id}/versions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionNo }),
    });
    onReload(); // 重新拉取详情（content 变了）
    setEditorKey((k) => k + 1);
    setSaveState("saved");
  }

  // ── 重跑 ──
  async function reprocess(mode: TaskMode, precision: Precision) {
    if (
      !window.confirm(
        `以「${MODE_LABEL[mode]}${mode === "general" ? ` · ${PRECISION_LABEL[precision]}` : ""}」重新识别？当前编辑与版本历史将被清除。`,
      )
    )
      return;
    await fetchJson(`/api/tasks/${task.id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, precision }),
    });
    onReload();
  }

  const currentVersion = versions.find((v) => v.isCurrent);

  return (
    <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[44%_1fr]" style={{ minHeight: "calc(100vh - 60px)" }}>
      {/* 左：原图 */}
      <ImagePane
        taskId={task.id}
        hasOriginal={!!task.originalImagePath}
        imageWidth={doc.image.width}
        imageHeight={doc.image.height}
        blocks={doc.blocks}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          if (id) {
            document.getElementById(`blk-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }}
      />

      {/* 右：文档块 */}
      <section aria-label="识别结果编辑" className="flex min-w-0 flex-col bg-card">
        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => void saveTitle(e.target.value.trim() || task.title)}
            aria-label="任务题名"
            className="min-w-0 flex-1 basis-full rounded-[10px] border border-transparent bg-transparent px-2.5 py-1 font-serif text-[16px] font-bold tracking-[0.03em] text-ink outline-none transition-all hover:border-line-strong focus:border-red focus:shadow-[0_0_0_3px_var(--red-ring)] sm:basis-auto"
          />

          {/* 保存状态 */}
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3" aria-live="polite">
            {saveState === "saved" && (
              <>
                <span className="size-1.5 rounded-full bg-moss" />
                {savedAt ? `已保存 · ${savedAt}` : "已保存"}
              </>
            )}
            {saveState === "dirty" && (
              <>
                <span className="size-1.5 rounded-full bg-gold" />
                未保存
              </>
            )}
            {saveState === "saving" && (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                保存中…
              </>
            )}
            {saveState === "error" && (
              <>
                <span className="size-1.5 rounded-full bg-red" />
                保存失败
                <button
                  type="button"
                  className="font-semibold text-red hover:text-red-deep"
                  onClick={() => setSaveState("dirty")}
                >
                  重试
                </button>
              </>
            )}
          </span>

          <Menu
            label={
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold text-ink-2 shadow-card hover:text-ink">
                <RotateCcw className="size-3.5" /> 换模式重跑
              </span>
            }
          >
            {(close) => (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-ink-4">
                  重新识别（清除当前编辑）
                </p>
                {(["general", "table", "deep"] as TaskMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium text-ink-2 hover:bg-paper"
                    onClick={() => {
                      close();
                      void reprocess(m, m === "general" ? "high" : "standard");
                    }}
                  >
                    {MODE_LABEL[m]}
                    {task.mode === m && <span className="text-[11px] text-ink-4">当前</span>}
                  </button>
                ))}
              </>
            )}
          </Menu>

          <Menu
            label={
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 text-[13px] font-semibold text-ink shadow-card hover:border-ink-4">
                <Download className="size-3.5" /> 导出
              </span>
            }
          >
            {() => (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-ink-4">
                  导出当前版本
                </p>
                {[
                  { format: "docx", label: "Word 文档 (.docx)" },
                  { format: "xlsx", label: "Excel 表格 (.xlsx)" },
                  { format: "md", label: "Markdown (.md)" },
                  { format: "txt", label: "纯文本 (.txt)" },
                ].map((f) => (
                  <a
                    key={f.format}
                    href={`/api/tasks/${task.id}/export?format=${f.format}`}
                    className="block rounded-lg px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-paper"
                  >
                    {f.label}
                  </a>
                ))}
              </>
            )}
          </Menu>
        </div>

        {/* 块列表 */}
        <div key={editorKey} className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          {doc.blocks.map((block) => {
            const selected = block.id === selectedId;
            return (
              <article
                key={block.id}
                id={`blk-${block.id}`}
                tabIndex={-1}
                onClick={() => setSelectedId(block.id)}
                className={`group relative mb-1.5 cursor-text rounded-xl border-[1.5px] px-3.5 py-2.5 transition-all duration-[140ms] ease-out ${
                  selected
                    ? "border-red/35 bg-red-wash shadow-[0_2px_10px_rgba(224,53,48,0.1)]"
                    : "border-transparent hover:bg-paper"
                }`}
              >
                {/* 角标：类型 + 置信度 */}
                <span className="pointer-events-none absolute right-3 top-2.5 font-mono text-[10.5px] text-ink-4 opacity-0 transition-opacity group-hover:opacity-100">
                  {TYPE_LABEL[block.type]}
                  {block.type === "table" && ` · ${block.table.rows}×${block.table.cols}`}
                  <ConfTag value={block.confidence} />
                </span>

                {/* 删除块 */}
                <button
                  type="button"
                  aria-label={`删除${TYPE_LABEL[block.type]}块`}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBlock(block.id);
                  }}
                  className="absolute bottom-2 right-3 grid size-6 place-items-center rounded-md text-ink-4 opacity-0 transition-all hover:bg-red-wash hover:text-red group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>

                <BlockEditor block={block} onChange={updateBlock} />
              </article>
            );
          })}

          <button
            type="button"
            onClick={appendParagraph}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2.5 text-[13px] font-medium text-ink-3 transition-colors hover:border-red hover:bg-red-wash hover:text-red"
          >
            <Plus className="size-3.5" /> 追加段落
          </button>
        </div>

        {/* 底部：版本 + 校讫章 */}
        <footer className="flex flex-wrap items-center gap-2.5 border-t border-line bg-paper px-4 py-2.5 text-[12.5px] text-ink-3">
          <Menu
            align="left"
            side="top"
            buttonClassName="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 py-1 text-xs font-semibold text-ink shadow-card hover:border-ink-4"
            label={
              <>
                <ChevronUp className="size-3.5" />
                {currentVersion ? `v${currentVersion.versionNo} · ${currentVersion.label ?? "当前"}` : "版本"}
              </>
            }
          >
            {(close) => (
              <div className="w-72 max-w-[calc(100vw-3rem)]">
                <SnapshotForm onSnapshot={(label) => void snapshot(label)} />
                <div className="scroll-thin mt-1 max-h-56 overflow-y-auto">
                  {[...versions].reverse().map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-paper"
                    >
                      <span className="w-8 shrink-0 font-mono text-xs font-semibold text-ink">
                        v{v.versionNo}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                        {v.label ?? ""}
                        {v.isCurrent && (
                          <span className="ml-1.5 rounded-full bg-moss-wash px-1.5 py-px text-[10.5px] font-semibold text-moss">
                            当前
                          </span>
                        )}
                      </span>
                      {!v.isCurrent && (
                        <button
                          type="button"
                          onClick={() => {
                            close();
                            void rollback(v.versionNo);
                          }}
                          className="shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-red hover:bg-red-wash"
                        >
                          回滚
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Menu>
          <span>快照 · 回滚</span>
          <span className="ml-2 font-mono text-[11px] text-ink-4">
            {doc.blocks.length} 块 · {MODE_LABEL[task.mode]}
          </span>
          <span className="stamp ml-auto" title="校对完成">
            校讫
          </span>
        </footer>
      </section>
    </div>
  );
}

/** 快照表单：命名 + 提交 */
function SnapshotForm({ onSnapshot }: { onSnapshot: (label: string) => void }) {
  const [label, setLabel] = useState("");
  return (
    <form
      className="flex gap-1.5 border-b border-line pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSnapshot(label.trim());
        setLabel("");
      }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="快照名称…"
        aria-label="快照名称"
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-4 focus:border-red"
      />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-2"
      >
        <Check className="size-3" /> 快照
      </button>
    </form>
  );
}
