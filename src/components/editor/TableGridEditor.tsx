"use client";

import { useState } from "react";
import type { TableData, TableCell } from "@/lib/normalize/types";
import {
  buildMatrix,
  spanSize,
  mergeCells,
  splitCell,
  insertRow,
  deleteRow,
  insertCol,
  deleteCol,
} from "@/lib/normalize/tableMath";

/**
 * 表格网格编辑器：HTML table + rowspan/colspan 渲染合并单元格。
 * 支持增删行列、单元格编辑、合并选中区域、拆分合并格。
 * 所有结构变更通过 onChange 上抛（tableMath 纯函数计算新坐标）。
 */

interface Props {
  table: TableData;
  onChange: (next: TableData) => void;
}

export function TableGridEditor({ table, onChange }: Props) {
  const [selected, setSelected] = useState<string[]>([]); // 选中的 cell 标识 "r,c"
  const [editing, setEditing] = useState<string | null>(null);

  const matrix = buildMatrix(table.cells, table.rows, table.cols);

  const selectedCells: TableCell[] = selected
    .map((key) => {
      const [r, c] = key.split(",").map(Number);
      return matrix[r]?.[c] ?? null;
    })
    .filter((c): c is TableCell => c !== null)
    .filter((c, i, arr) => arr.findIndex((x) => x === c) === i); // 去重（合并格）

  const canMerge = selectedCells.length > 1;
  const canSplit = selectedCells.length === 1 &&
    (selectedCells[0].rowEnd > selectedCells[0].rowStart ||
      selectedCells[0].colEnd > selectedCells[0].colStart);

  function toggleSelect(r: number, c: number, e: React.MouseEvent) {
    const key = `${r},${c}`;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    } else {
      setSelected([key]);
    }
  }

  function updateCellText(cell: TableCell, text: string) {
    onChange({
      ...table,
      cells: table.cells.map((c) => (c === cell ? { ...c, text } : c)),
    });
  }

  function doMerge() {
    if (!canMerge) return;
    const merged = mergeCells(selectedCells);
    const kept = new Set(selectedCells);
    onChange({
      ...table,
      cells: [
        ...table.cells.filter((c) => !kept.has(c)),
        merged,
      ],
    });
    setSelected([]);
  }

  function doSplit() {
    if (!canSplit) return;
    const cell = selectedCells[0];
    const pieces = splitCell(cell);
    onChange({
      ...table,
      cells: [...table.cells.filter((c) => c !== cell), ...pieces],
    });
    setSelected([]);
  }

  return (
    <div className="space-y-2">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button className={toolBtn} onClick={doMerge} disabled={!canMerge}>
          合并选中
        </button>
        <button className={toolBtn} onClick={doSplit} disabled={!canSplit}>
          拆分单元格
        </button>
        <span className="mx-1 text-muted-foreground/50">|</span>
        <button
          className={toolBtn}
          onClick={() => onChange(insertRow(table, table.rows))}
        >
          + 行
        </button>
        <button className={toolBtn} onClick={() => onChange(insertCol(table, table.cols))}>
          + 列
        </button>
        <span className="mx-1 text-muted-foreground/50">|</span>
        <button className={toolBtnDanger} onClick={() => onChange(deleteRow(table, table.rows - 1))}>
          − 行
        </button>
        <button className={toolBtnDanger} onClick={() => onChange(deleteCol(table, table.cols - 1))}>
          − 列
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {matrix.map((row, r) => (
              <tr key={r} className="group/row">
                <td className="w-8 border bg-muted/50 px-1 text-center align-middle">
                  <div className="flex flex-col items-center">
                    <button
                      title="上方插入行"
                      className="opacity-0 transition-opacity group-hover/row:opacity-100"
                      onClick={() => onChange(insertRow(table, r))}
                    >
                      ＋
                    </button>
                    <button
                      title="删除此行"
                      className="text-destructive opacity-0 transition-opacity group-hover/row:opacity-100"
                      onClick={() => onChange(deleteRow(table, r))}
                    >
                      ×
                    </button>
                  </div>
                </td>
                {row.map((cell, c) => {
                  if (!cell) {
                    return <td key={c} className="border p-0" />;
                  }
                  // 合并格只渲染左上角
                  if (cell.rowStart !== r || cell.colStart !== c) return null;
                  const { rowSpan, colSpan } = spanSize(cell);
                  const isSelected = selected.includes(`${r},${c}`);
                  const key = `${cell.rowStart},${cell.colStart}`;
                  return (
                    <td
                      key={key}
                      rowSpan={rowSpan}
                      colSpan={colSpan}
                      onClick={(e) => toggleSelect(r, c, e)}
                      onDoubleClick={() => setEditing(key)}
                      className={`border p-0 align-top ${
                        isSelected ? "bg-primary/10 outline outline-1 outline-primary" : "hover:bg-muted/40"
                      } ${rowSpan > 1 || colSpan > 1 ? "relative" : ""}`}
                    >
                      {editing === key ? (
                        <textarea
                          autoFocus
                          defaultValue={cell.text}
                          onBlur={(e) => {
                            updateCellText(cell, e.target.value);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="min-h-16 w-full resize-y bg-background p-1.5 text-sm outline-none"
                        />
                      ) : (
                        <div className="min-h-8 p-1.5 whitespace-pre-wrap">
                          {cell.text || <span className="text-muted-foreground/40">双击编辑</span>}
                        </div>
                      )}
                      {(rowSpan > 1 || colSpan > 1) && (
                        <span className="absolute right-0.5 top-0.5 text-[10px] text-muted-foreground/50">
                          合
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        单击选中（⌘/Shift 多选）· 双击编辑 · 行首 ＋/× 插入删除行
      </p>
    </div>
  );
}

const toolBtn =
  "rounded border px-2 py-1 transition-colors hover:bg-muted disabled:opacity-40";
const toolBtnDanger = `${toolBtn} text-destructive`;
