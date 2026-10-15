"use client";

import { useMemo, useState } from "react";
import type { TableCell, TableData } from "@/lib/normalize/types";
import {
  buildMatrix,
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  isOrigin,
  mergeCells,
  spanSize,
  splitCell,
} from "@/lib/normalize/tableMath";
import Editable from "./Editable";

/**
 * 表格网格编辑器：墨线格 + 行列增删 / 合并拆分。
 * 坐标运算全部走 tableMath 纯函数。
 */
export default function TableGridEditor({
  table,
  onChange,
}: {
  table: TableData;
  onChange: (next: TableData) => void;
}) {
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const matrix = useMemo(
    () => buildMatrix(table.cells, table.rows, table.cols),
    [table],
  );

  const activeCell = active ? matrix[active.r]?.[active.c] ?? null : null;

  /** 把某个 cell 替换为新 cell（或一组） */
  function replaceCell(target: TableCell, next: TableCell[]) {
    onChange({
      ...table,
      cells: table.cells.flatMap((c) => (c === target ? next : [c])),
    });
  }

  function commitText(cell: TableCell, text: string) {
    if (cell.text === text) return;
    onChange({
      ...table,
      cells: table.cells.map((c) => (c === cell ? { ...c, text } : c)),
    });
  }

  /** 与左侧 / 上方相邻格合并 */
  function mergeWith(dr: number, dc: number) {
    if (!active) return;
    const cell = matrix[active.r][active.c];
    if (!cell) return;
    const nr = active.r + dr;
    const nc = active.c + dc;
    const neighbor = matrix[nr]?.[nc];
    if (!neighbor || neighbor === cell) return;
    onChange({
      ...table,
      cells: table.cells
        .filter((c) => c !== cell && c !== neighbor)
        .concat(mergeCells([cell, neighbor])),
    });
    setActive(null);
  }

  const canSplit =
    activeCell && (activeCell.rowEnd > activeCell.rowStart || activeCell.colEnd > activeCell.colStart);

  const btn =
    "rounded-md border border-line bg-card px-2 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-paper disabled:opacity-40";

  return (
    <div>
      {/* 操作条：有激活格时可用 */}
      <div
        className="mb-2 flex flex-wrap items-center gap-1.5"
        role="toolbar"
        aria-label="表格行列操作"
      >
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && onChange(insertRow(table, active.r))}
        >
          ↑ 插行
        </button>
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && onChange(insertRow(table, active.r + 1))}
        >
          ↓ 插行
        </button>
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && onChange(insertCol(table, active.c))}
        >
          ← 插列
        </button>
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && onChange(insertCol(table, active.c + 1))}
        >
          → 插列
        </button>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
        <button
          type="button"
          className={btn}
          disabled={!activeCell || table.rows <= 1}
          onClick={() => {
            if (!active) return;
            onChange(deleteRow(table, active.r));
            setActive(null);
          }}
        >
          删行
        </button>
        <button
          type="button"
          className={btn}
          disabled={!activeCell || table.cols <= 1}
          onClick={() => {
            if (!active) return;
            onChange(deleteCol(table, active.c));
            setActive(null);
          }}
        >
          删列
        </button>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && mergeWith(0, -1)}
        >
          合并←
        </button>
        <button
          type="button"
          className={btn}
          disabled={!activeCell}
          onClick={() => active && mergeWith(-1, 0)}
        >
          合并↑
        </button>
        <button
          type="button"
          className={btn}
          disabled={!canSplit}
          onClick={() => {
            if (!activeCell) return;
            replaceCell(activeCell, splitCell(activeCell));
            setActive(null);
          }}
        >
          拆分
        </button>
      </div>

      <table className="grid-table">
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                if (cell === null) return null; // 被合并格覆盖
                if (!isOrigin(cell, r, c)) return null;
                const { rowSpan, colSpan } = spanSize(cell);
                const isActive = active?.r === r && active?.c === c;
                const Tag = r === 0 ? "th" : "td";
                return (
                  <Tag
                    key={c}
                    rowSpan={rowSpan}
                    colSpan={colSpan}
                    className={isActive ? "cell-active" : ""}
                    onMouseDown={() => setActive({ r, c })}
                  >
                    <Editable
                      value={cell.text}
                      placeholder=" "
                      ariaLabel={`第 ${r + 1} 行第 ${c + 1} 列`}
                      onCommit={(text) => commitText(cell, text)}
                      className="text-[13px] leading-relaxed"
                    />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
