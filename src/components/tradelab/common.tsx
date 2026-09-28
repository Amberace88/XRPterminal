"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, CandlestickChart, FlaskConical, History, LineChart, Trophy, Workflow } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatAge, formatMoney, formatPct, formatPrice, formatSignedMoney } from "@/lib/format";
import type { DataStatus } from "@/lib/types/market";
import type { OrderStatus } from "@/lib/tradelab/types";

export const TRADELAB_TABS = [
  { href: "/trade-lab", label: "Terminal", icon: CandlestickChart },
  { href: "/trade-lab/performance", label: "Performance", icon: LineChart },
  { href: "/trade-lab/journal", label: "Journal", icon: BookOpenText },
  { href: "/trade-lab/replay", label: "Replay", icon: History },
  { href: "/trade-lab/strategy", label: "Strategy Lab", icon: Workflow },
  { href: "/trade-lab/challenges", label: "Challenges", icon: Trophy },
] as const;

export function TradeLabNav() {
  const path = usePathname();
  return (
    <nav aria-label="Trade Lab sections" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {TRADELAB_TABS.map((t) => {
          const active = t.href === "/trade-lab" ? path === t.href : path?.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  active ? "bg-surface-elevated text-fg ring-1 ring-border" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const usd = (v: number | null | undefined, d = 2) => formatMoney(v, "USD", d);
export const susd = (v: number | null | undefined, d = 2) => formatSignedMoney(v, "USD", d);
export const px = (v: number | string | null | undefined) => formatPrice(v === null || v === undefined ? null : Number(v), "USD");
export const qtyFmt = (v: number | string | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 });
export const pct = (v: number | null | undefined, d = 2, signed = true) => formatPct(v, d, signed);

export function PnL({ value, pctValue, className }: { value: number | null | undefined; pctValue?: number | null; className?: string }) {
  const tone = value === null || value === undefined || value === 0 || !Number.isFinite(value) ? "text-fg-secondary" : value > 0 ? "text-success" : "text-danger";
  return (
    <span className={cn("num", tone, className)}>
      {susd(value)}
      {pctValue !== undefined && pctValue !== null && Number.isFinite(pctValue) && <span className="ml-1 text-2xs opacity-80">({pct(pctValue)})</span>}
    </span>
  );
}

const STATUS_TONE: Record<OrderStatus, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  CREATED: "neutral",
  OPEN: "accent",
  TRIGGERED: "info",
  PARTIALLY_FILLED: "info",
  FILLED: "success",
  CANCELLED: "neutral",
  EXPIRED: "warning",
  REJECTED: "danger",
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status.replace("_", " ")}</Badge>;
}

export function SideBadge({ side }: { side: "BUY" | "SELL" | "LONG" }) {
  return <Badge tone={side === "SELL" ? "danger" : "success"}>{side}</Badge>;
}

/** Honest market-data label: LIVE only when streaming, otherwise "Last updated …" (spec §91). */
export function MarketDataLabel({ status, streaming, updatedAt, venue, className }: { status: DataStatus; streaming: boolean; updatedAt: number | null; venue?: string | null; className?: string }) {
  const live = status === "LIVE" && streaming;
  return (
    <Tooltip content={<span>{venue ? `Source: ${venue}. ` : ""}Paper fills use this captured price. {live ? "Streaming in real time." : "Not streaming — prices may be delayed."}</span>}>
      <span tabIndex={0} className={cn("inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide", live ? "text-success" : status === "UNAVAILABLE" ? "text-fg-muted" : "text-warning", className)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse2 bg-success" : status === "UNAVAILABLE" ? "bg-fg-muted" : "bg-warning")} />
        {live ? "Live data" : status === "UNAVAILABLE" ? "No market data" : `Last updated ${formatAge(updatedAt)}`}
      </span>
    </Tooltip>
  );
}

export function SimTag({ className }: { className?: string }) {
  return <TrustBadge kind="SIMULATED" className={className} />;
}

export function PaperNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-2xs leading-relaxed text-fg-muted", className)}>
      <FlaskConical className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
      <span>Past simulated performance does not guarantee future results. Paper trading does not reproduce every condition of live markets.</span>
    </p>
  );
}

export function KV({ label, value, tip, className }: { label: React.ReactNode; value: React.ReactNode; tip?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 text-xs", className)}>
      <span className="text-fg-muted">{tip ? <Tooltip content={tip}><span className="cursor-help border-b border-dotted border-fg-muted/50" tabIndex={0}>{label}</span></Tooltip> : label}</span>
      <span className="num text-right font-medium text-fg">{value}</span>
    </div>
  );
}

export function NumInput({
  id,
  value,
  onChange,
  placeholder,
  suffix,
  step = "any",
  min,
  className,
  ariaLabel,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  step?: string;
  min?: number;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("input num h-9", suffix && "pr-12")}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-fg-muted">{suffix}</span>}
    </div>
  );
}

export function ProgressBar({ value, tone = "accent", className, label }: { value: number; tone?: "accent" | "success" | "danger" | "warning"; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-hover", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-all duration-500", tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent")} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Evenly sample a series down to at most `max` points (always keeps first & last). */
export function sample<T>(arr: T[], max = 600): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}
