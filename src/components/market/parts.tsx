"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, Skeleton } from "@/components/ui/States";
import type { ApiError } from "@/hooks/useApi";
import type { HealthTone, HealthTrend } from "@/lib/analytics/health";

/** Trend arrow with accessible label. `goodWhenUp` flips colours (e.g. rising volatility is not "good"). */
export function TrendArrow({ trend, note, neutral = true, className }: { trend: HealthTrend; note?: string; neutral?: boolean; className?: string }) {
  if (!trend) return <span className={cn("text-2xs text-fg-muted", className)}>—</span>;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  const color = neutral ? "text-fg-secondary" : trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-fg-muted";
  const label = trend === "up" ? "Rising" : trend === "down" ? "Falling" : "Flat";
  const icon = (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs", color, className)} aria-label={`${label}${note ? ` (${note})` : ""}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
  return note ? <Tooltip content={note}>{icon}</Tooltip> : icon;
}

/** Horizontal 0–100 percentile bar with marker. */
export function PercentileBar({ value, className, showLabel = true }: { value: number | null; className?: string; showLabel?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-2xs text-fg-muted", className)}>n/a</span>;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("inline-flex min-w-[88px] items-center gap-2", className)} aria-label={`${v.toFixed(0)}th percentile`}>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent/50" style={{ width: `${v}%` }} />
        <span className="absolute inset-y-[-2px] w-0.5 rounded bg-accent" style={{ left: `calc(${v}% - 1px)` }} />
      </span>
      {showLabel && <span className="num w-8 text-right text-2xs text-fg-secondary">P{v.toFixed(0)}</span>}
    </span>
  );
}

export const TONE_BADGE: Record<HealthTone, "success" | "neutral" | "warning" | "danger" | "info"> = {
  good: "success",
  neutral: "info",
  caution: "warning",
  warning: "danger",
  muted: "neutral",
};

/** Data-quality flags from server-side validation (spec §157). */
export function QualityFlags({ flags, className }: { flags?: string[] | null; className?: string }) {
  if (!flags?.length) return null;
  return (
    <Tooltip
      content={
        <span className="block space-y-0.5">
          <span className="block font-medium text-fg">Data-quality flags</span>
          {flags.map((f) => (
            <span key={f} className="block">
              • {f}
            </span>
          ))}
        </span>
      }
    >
      <span tabIndex={0} className={cn("inline-flex", className)}>
        <Badge tone="warning">
          <TriangleAlert className="h-3 w-3" /> {flags.length} flag{flags.length > 1 ? "s" : ""}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** Collapsible methodology note (native <details> — accessible, no JS needed). */
export function Methodology({ children, title = "Methodology", className }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <details className={cn("group rounded-lg border border-border-subtle bg-bg-secondary/40 text-xs text-fg-secondary", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-border-subtle px-3 py-2.5 leading-relaxed">{children}</div>
    </details>
  );
}

/** Loading / error wrapper for async panels. Renders children only when data exists. */
export function AsyncBlock({
  loading,
  error,
  hasData,
  onRetry,
  lastUpdated,
  provider,
  height = 200,
  children,
  compact,
}: {
  loading: boolean;
  error: ApiError | null;
  hasData: boolean;
  onRetry?: () => void;
  lastUpdated?: number | null;
  provider?: string;
  height?: number;
  children: React.ReactNode;
  compact?: boolean;
}) {
  if (hasData) return <>{children}</>;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} lastUpdated={lastUpdated} provider={provider} compact={compact} />;
  if (loading)
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="w-full" />
        <div style={{ height: Math.max(0, height - 40) }}>
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  return <>{children}</>;
}

/** Short month-year label for chart axes, UTC. */
export function monthYear(t: number | string): string {
  const d = new Date(Number(t));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** UTC calendar date. */
export function utcDate(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Down-sample rows for Recharts. Keeps the first and last row; within each bucket keeps the row that minimizes
 * (or maximizes) `extremeKey` when given, otherwise the bucket's last row.
 */
export function downsample<T extends Record<string, unknown>>(rows: T[], max = 700, extremeKey?: keyof T, mode: "min" | "max" = "min"): T[] {
  if (rows.length <= max) return rows;
  const size = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const bucket = rows.slice(i, i + size);
    if (extremeKey) {
      let pick = bucket[bucket.length - 1];
      for (const r of bucket) {
        const v = r[extremeKey] as unknown as number | null;
        const p = pick[extremeKey] as unknown as number | null;
        if (v === null || v === undefined) continue;
        if (p === null || p === undefined || (mode === "min" ? v < p : v > p)) pick = r;
      }
      out.push(pick);
    } else out.push(bucket[bucket.length - 1]);
  }
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

export function Chip({ active, onClick, children, disabled, title }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-2xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "border-accent/50 bg-accent/10 text-accent-strong" : "border-border-subtle text-fg-muted hover:border-border hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
