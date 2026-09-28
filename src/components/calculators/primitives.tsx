"use client";

import { useEffect, useId, useState } from "react";
import { Link2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

export function CalcCard({ id, title, subtitle, children, className, badge }: { id: string; title: string; subtitle?: string; children: React.ReactNode; className?: string; badge?: React.ReactNode }) {
  return (
    <Card id={id} className={cn("scroll-mt-24", className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {badge}
            <a href={`#${id}`} className="rounded p-1 text-fg-muted hover:text-fg" aria-label={`Link to ${title}`}>
              <Link2 className="h-3.5 w-3.5" />
            </a>
          </>
        }
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/** Numeric input that keeps the raw text while typing and reports a number (NaN when empty/invalid). */
export function NumField({
  label,
  value,
  onChange,
  step = "any",
  min,
  suffix,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string | number;
  min?: number;
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  useEffect(() => {
    const cur = text === "" ? NaN : Number(text);
    if (cur === value || (Number.isNaN(cur) && Number.isNaN(value))) return;
    setText(Number.isFinite(value) ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          className={cn("input num w-full", suffix && "pr-12")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value === "" ? NaN : Number(e.target.value));
          }}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-2xs text-fg-muted">{suffix}</span>}
      </div>
      {hint && <p className="text-2xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function Result({ label, value, tone, big }: { label: string; value: React.ReactNode; tone?: "up" | "down" | "neutral"; big?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 py-2">
      <div className="label">{label}</div>
      <div className={cn("num mt-0.5 font-semibold", big ? "text-lg" : "text-sm", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-fg")}>{value}</div>
    </div>
  );
}

export function Invalid({ text = "Enter valid positive numbers to see results." }: { text?: string }) {
  return <p className="text-xs text-fg-muted">{text}</p>;
}

export function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-secondary">{label}</span>
      <div className="inline-flex rounded-lg border border-border-subtle bg-bg-secondary p-0.5" role="radiogroup" aria-label={label}>
        {items.map((i) => (
          <button
            key={i.value}
            type="button"
            role="radio"
            aria-checked={value === i.value}
            onClick={() => onChange(i.value)}
            className={cn("flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", value === i.value ? "bg-surface-elevated text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg")}
          >
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seed a numeric state with the live price once it becomes available (user edits win afterwards). */
export function usePriceSeed(price: number | null | undefined, set: (v: number) => void) {
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && price && Number.isFinite(price)) {
      set(Number(price.toPrecision(5)));
      setSeeded(true);
    }
  }, [price, seeded, set]);
}
