"use client";

import { useEffect, useRef } from "react";

/**
 * 非受控 contentEditable：挂载与外部值变化时同步文本，
 * 聚焦时不回写避免光标跳动，blur 时提交。
 */
export default function Editable({
  value,
  onCommit,
  className = "",
  placeholder,
  ariaLabel,
  multiline = false,
}: {
  value: string;
  onCommit: (text: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerText !== value) {
      el.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline={multiline}
      aria-label={ariaLabel}
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      onBlur={(e) => {
        const text = e.currentTarget.innerText.replace(/ /g, " ");
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      className={`editable ${className}`}
    />
  );
}
