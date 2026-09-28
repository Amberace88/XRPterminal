import { cn } from "@/lib/utils/cn";
import { InfoTip } from "./Tooltip";
import { Skeleton } from "./States";

/** Compact KPI tile. Pass `loading` to render a skeleton instead of a misleading zero. */
export function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaTone,
  info,
  loading,
  className,
  footer,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "up" | "down" | "neutral";
  info?: string;
  loading?: boolean;
  className?: string;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("card flex flex-col justify-between gap-2 p-4", className)}>
      <div className="flex items-center gap-1.5">
        <span className="label">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      {loading ? (
        <Skeleton className={cn(size === "lg" ? "h-9 w-40" : "h-7 w-28")} />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              "num font-semibold tracking-tight text-fg",
              size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl",
            )}
          >
            {value}
          </span>
          {delta !== undefined && delta !== null && (
            <span
              className={cn(
                "num text-sm font-medium",
                deltaTone === "up" ? "text-success" : deltaTone === "down" ? "text-danger" : "text-fg-secondary",
              )}
            >
              {delta}
            </span>
          )}
        </div>
      )}
      {sub && <div className="text-xs text-fg-muted">{sub}</div>}
      {footer}
    </div>
  );
}

export function toneOf(v: number | null | undefined): "up" | "down" | "neutral" {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "neutral";
  return v > 0 ? "up" : "down";
}

export function Delta({ value, suffix = "%", decimals = 2, className }: { value: number | null | undefined; suffix?: string; decimals?: number; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("text-fg-muted", className)}>—</span>;
  const tone = toneOf(value);
  return (
    <span className={cn("num", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-fg-secondary", className)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
