"use client";

import { Badge } from "@/components/ui/Badge";
import { formatDate, formatPct, formatPrice } from "@/lib/format";
import type { HorizonStatusKind, ScenarioKind } from "@/lib/forecast/types";

export const px = (v: number | null | undefined) => formatPrice(v, "USD");
export const pctRange = (lo: number, hi: number) => `${formatPct(lo, 1)} to ${formatPct(hi, 1)}`;
export const utcDate = (t: number | string | null | undefined) => formatDate(t, "UTC");
export const numOrDash = (v: number | null | undefined, d = 1, suffix = "") => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}${suffix}`);

export const SCENARIO_STYLE: Record<ScenarioKind, { tone: "danger" | "accent" | "success" | "warning"; bar: string; ring: string; text: string }> = {
  BEAR: { tone: "danger", bar: "bg-danger/70", ring: "hover:border-danger/40", text: "text-danger" },
  BASE: { tone: "accent", bar: "bg-accent/80", ring: "hover:border-accent/40", text: "text-accent-strong" },
  BULL: { tone: "success", bar: "bg-success/70", ring: "hover:border-success/40", text: "text-success" },
  EXTREME: { tone: "warning", bar: "bg-warning/70", ring: "hover:border-warning/40", text: "text-warning" },
};

export function HorizonStatusBadge({ status }: { status: HorizonStatusKind }) {
  if (status === "enabled") return <Badge tone="success">Sample OK</Badge>;
  if (status === "low_sample") return <Badge tone="warning">Low sample</Badge>;
  return <Badge tone="neutral">Disabled</Badge>;
}

export function SmallN({ n, nEff, threshold = 30 }: { n: number; nEff?: number; threshold?: number }) {
  const eff = nEff ?? n;
  return (
    <span className="num inline-flex items-center gap-1">
      {n}
      {nEff !== undefined && nEff !== n && <span className="text-fg-muted">({nEff} eff.)</span>}
      {eff < threshold && (
        <Badge tone="warning" className="ml-0.5 px-1 py-0 text-[9px]">
          small N
        </Badge>
      )}
    </span>
  );
}
