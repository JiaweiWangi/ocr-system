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
  side = "bottom",
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  buttonClassName?: string;
  align?: "left" | "right";
  side?: "top" | "bottom";
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
          className={`anim-in absolute ${align === "right" ? "right-0" : "left-0"} ${side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"} z-30 max-h-[calc(100dvh-6rem)] min-w-52 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-lift`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
