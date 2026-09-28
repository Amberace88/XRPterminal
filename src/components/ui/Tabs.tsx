"use client";

import { cn } from "@/lib/utils/cn";

/** Segmented control / tabs. Keyboard accessible (arrow keys). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; disabled?: boolean; title?: string }[];
  size?: "xs" | "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    for (let i = 1; i <= items.length; i++) {
      const next = items[(idx + dir * i + items.length) % items.length];
      if (!next.disabled) {
        onChange(next.value);
        break;
      }
    }
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border-subtle bg-bg-secondary p-0.5", className)}
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            title={it.title}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.value)}
            className={cn(
              "whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              size === "xs" ? "px-2 py-0.5 text-2xs" : size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active ? "bg-surface-elevated text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
