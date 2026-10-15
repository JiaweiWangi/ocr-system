"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 轻量下拉菜单：按钮 + 绝对定位面板，点击外部关闭。
 * children 为渲染函数，收 close 用于选中后关闭。
 */
export default function Menu({
  label,
  children,
  buttonClassName = "",
  align = "right",
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  buttonClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={`anim-in absolute ${align === "right" ? "right-0" : "left-0"} top-[calc(100%+8px)] z-30 min-w-52 rounded-2xl border border-line bg-card p-2 shadow-lift`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
