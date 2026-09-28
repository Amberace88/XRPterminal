"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ClaimLabel } from "@/components/ui/Misc";
import { InfoTip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils/cn";
import { formatPct } from "@/lib/format";
import type { ForecastOutput, Scenario } from "@/lib/forecast/types";
import { pctRange, px, SCENARIO_STYLE } from "./shared";

function Section({ title, items, tone }: { title: string; items: string[]; tone?: "warning" }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={cn("label mb-1", tone === "warning" && "text-warning")}>{title}</div>
      <ul className="space-y-1 text-xs leading-relaxed text-fg-secondary">
        {items.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-muted" aria-hidden />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Position of the scenario range on a shared P1–P99 axis (log scale). */
function RangeBar({ s, min, max, anchor }: { s: Scenario; min: number; max: number; anchor: number }) {
  const lmin = Math.log(min);
  const span = Math.log(max) - lmin || 1;
  const pos = (v: number) => ((Math.log(v) - lmin) / span) * 100;
  const st = SCENARIO_STYLE[s.kind];
  const segs = s.kind === "EXTREME" && s.tails ? [s.tails.lower, s.tails.upper] : [s.range];
  return (
    <div className="relative mt-3 h-2 rounded-full bg-surface-hover" aria-hidden>
      {segs.map((r, i) => (
        <div key={i} className={cn("absolute top-0 h-2 rounded-full", st.bar)} style={{ left: `${pos(r.low)}%`, width: `${Math.max(1.5, pos(r.high) - pos(r.low))}%` }} />
      ))}
      <div className="absolute -top-1 h-4 w-px bg-fg" style={{ left: `${pos(anchor)}%` }} title="Anchor price" />
    </div>
  );
}

export function ScenarioCard({ s, f }: { s: Scenario; f: ForecastOutput }) {
  const st = SCENARIO_STYLE[s.kind];
  const anchor = f.inputs.anchorPrice;
  return (
    <article className={cn("card flex flex-col p-4 transition-colors animate-fade-up", st.ring)} aria-label={`${s.label} scenario`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={st.tone}>{s.kind}</Badge>
          <ClaimLabel kind="SCENARIO" />
        </div>
        <span className="num text-2xs text-fg-muted" title="Share of simulated paths ending in this band (model-implied, not a guarantee)">
          {s.band} · {(s.pathShare * 100).toFixed(0)}% of paths
        </span>
      </header>

      {s.kind === "EXTREME" && s.tails ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xs text-fg-muted">Below P5 (P1 ref.)</span>
            <span className="num text-sm font-semibold text-fg">
              {px(s.tails.lower.low)} – {px(s.tails.lower.high)}
            </span>
          </div>
          <div className="num text-right text-2xs text-fg-muted">{pctRange(s.tails.lower.lowPct, s.tails.lower.highPct)}</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xs text-fg-muted">Above P95 (P99 ref.)</span>
            <span className="num text-sm font-semibold text-fg">
              {px(s.tails.upper.low)} – {px(s.tails.upper.high)}
            </span>
          </div>
          <div className="num text-right text-2xs text-fg-muted">{pctRange(s.tails.upper.lowPct, s.tails.upper.highPct)}</div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="num text-lg font-semibold tracking-tight text-fg sm:text-xl">
            {px(s.range.low)} <span className="text-fg-muted">–</span> {px(s.range.high)}
          </div>
          <div className="num mt-0.5 text-xs text-fg-secondary">
            <span className={s.range.lowPct < 0 ? "text-danger" : "text-success"}>{formatPct(s.range.lowPct, 1)}</span>
            <span className="text-fg-muted"> to </span>
            <span className={s.range.highPct < 0 ? "text-danger" : "text-success"}>{formatPct(s.range.highPct, 1)}</span>
            <span className="text-fg-muted"> vs anchor</span>
          </div>
        </div>
      )}
      <RangeBar s={s} min={f.quantiles.p01} max={f.quantiles.p99} anchor={anchor} />

      <details className="group mt-4 border-t border-border-subtle pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">
          Assumptions, drivers, risks & invalidation
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          <Section title="Assumptions" items={s.assumptions} />
          <Section title="Drivers (measured)" items={s.drivers} />
          <Section title="Risks" items={s.risks} />
          <Section title="Invalidation conditions" items={s.invalidation} />
          <Section title="What would make this scenario less applicable?" items={s.lessApplicableIf} tone="warning" />
        </div>
      </details>
    </article>
  );
}

export function ScenarioCards({ f }: { f: ForecastOutput }) {
  return (
    <section aria-labelledby="scenarios-h" className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="scenarios-h" className="text-sm font-semibold text-fg">
          Scenarios · {f.horizonKey ?? `${f.horizonDays}D`} to {f.targetDate}
        </h2>
        <InfoTip text="Each scenario is a band of the simulated terminal-price distribution. The bands are contiguous: BEAR P5–P25, BASE P25–P75, BULL P75–P95, EXTREME the outer 10%. None of them is a price target." />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {f.scenarios.map((s) => (
          <ScenarioCard key={s.kind} s={s} f={f} />
        ))}
      </div>
    </section>
  );
}
