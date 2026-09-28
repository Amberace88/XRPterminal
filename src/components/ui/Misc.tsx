"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, FlaskConical, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { shortenMiddle } from "@/lib/format";
import { Tooltip } from "./Tooltip";
import { LEGAL_DISCLAIMER, PAPER_DISCLAIMER } from "@/lib/config";

export function CopyButton({ value, className, label = "Copy" }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg", className)}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Shortened address/hash with full value tooltip, copy button and optional link (spec §255/§256). */
export function Hash({
  value,
  href,
  head = 6,
  tail = 6,
  label,
  className,
}: {
  value: string;
  href?: string;
  head?: number;
  tail?: number;
  label?: string | null;
  className?: string;
}) {
  const text = label ?? shortenMiddle(value, head, tail);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 font-mono text-xs", className)}>
      <Tooltip content={<span className="break-all font-mono">{value}</span>}>
        {href ? (
          <Link href={href} className="truncate text-accent-strong hover:underline">
            {text}
          </Link>
        ) : (
          <span className="truncate text-fg-secondary">{text}</span>
        )}
      </Tooltip>
      <CopyButton value={value} />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Mandatory simulation indicator for all Trade Lab surfaces (spec §266). */
export function SimulatedBanner({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed border-warning/40 bg-warning/[0.06] text-warning",
        compact ? "px-2.5 py-1 text-2xs" : "px-3 py-2 text-xs",
        className,
      )}
      role="note"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong className="font-semibold tracking-wide">SIMULATED / DEMO</strong>
        {!compact && <> — virtual capital only. No real money, no real orders, no exchange execution. {PAPER_DISCLAIMER}</>}
      </span>
    </div>
  );
}

export function Disclaimer({ className, short }: { className?: string; short?: boolean }) {
  return (
    <p className={cn("flex gap-2 text-2xs leading-relaxed text-fg-muted", className)}>
      <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {short
          ? "Informational & analytical purposes only — not investment advice. Scenarios are not predictions; crypto-assets are volatile and you may lose capital."
          : LEGAL_DISCLAIMER}
      </span>
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-secondary">
        {label}
      </label>
      {children}
      {error ? <p className="text-2xs text-danger">{error}</p> : hint ? <p className="text-2xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-accent bg-accent" : "border-border bg-surface-hover",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}

export function Stat({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", className)}>
      <span className="text-fg-muted">{label}</span>
      <span className="num text-right font-medium text-fg">{value}</span>
    </div>
  );
}

/** Label for FACT / ANALYSIS / SCENARIO / SPECULATION (spec §161). */
export function ClaimLabel({ kind }: { kind: "FACT" | "ANALYSIS" | "SCENARIO" | "SPECULATION" }) {
  const map = {
    FACT: "bg-success/10 text-success border-success/25",
    ANALYSIS: "bg-info/10 text-info border-info/25",
    SCENARIO: "bg-accent/10 text-accent-strong border-accent/25",
    SPECULATION: "bg-warning/10 text-warning border-warning/25",
  } as const;
  return <span className={cn("rounded border px-1 py-px text-[10px] font-bold tracking-wider", map[kind])}>{kind}</span>;
}
