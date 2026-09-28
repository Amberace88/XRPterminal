"use client";

import { useMemo } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { FanChart } from "@/components/charts/Charts";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { DataFreshness, SourceLine } from "@/components/ui/DataFreshness";
import { Stat } from "@/components/ui/Misc";
import { InfoTip, GLOSSARY } from "@/components/ui/Tooltip";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { CurrentForecastResponse } from "@/lib/forecast/api-types";
import { HorizonStatusBadge, px, utcDate } from "./shared";

export function ForecastFanCard({ data }: { data: CurrentForecastResponse }) {
  const f = data.forecast;
  const rows = useMemo(() => {
    const hist = data.history.map((h) => ({ t: h.t, price: h.c }));
    const fan = f.fan.map((p, i) => ({ t: p.t, price: i === 0 ? f.inputs.anchorPrice : undefined, p05: p.p05, p25: p.p25, p50: p.p50, p75: p.p75, p95: p.p95 }));
    // anchor point already present in history; the first fan point shares its timestamp
    return [...hist.filter((h) => h.t < f.asOf), ...fan];
  }, [data.history, f]);
  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Scenario fan"
        subtitle={`Last ${data.history.length} daily closes + simulated distribution to ${utcDate(f.targetDate)}`}
        info="Shaded bands show the P25–P75 (inner) and P5–P95 (outer) range of simulated paths at each future day; the dashed line is the path median. Bands are not targets."
        actions={<DataFreshness provenance={data.provenance} timestamp={f.asOf + 86_400_000} kind="daily" />}
      />
      <CardBody>
        <FanChart data={rows} height={320} xFormat={(v) => utcDate(Number(v))} yFormat={(v) => formatPrice(v, "USD")} />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-fg-secondary" /> XRP-USD daily close
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-accent/40" /> P25–P75
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-accent/15" /> P5–P95
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-accent-strong" /> Median path (not a target)
          </span>
        </div>
      </CardBody>
      <CardFooter>
        <SourceLine provenance={data.provenance} />
        <span className="hidden sm:inline">Seed {f.parameters.seed}</span>
      </CardFooter>
    </Card>
  );
}

export function ForecastSummaryCard({ data, onMethodology }: { data: CurrentForecastResponse; onMethodology: () => void }) {
  const f = data.forecast;
  const u = f.uncertainty;
  const pub = data.publication;
  return (
    <Card className="lg:col-span-4">
      <CardHeader title="Forecast record" subtitle={`${f.modelName} v${f.modelVersion}`} actions={<TrustBadge kind="MODEL" />} />
      <CardBody className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-3">
          <div className="label">Central 50% range (BASE)</div>
          <div className="num mt-1 text-lg font-semibold text-fg">
            {px(f.quantiles.p25)} – {px(f.quantiles.p75)}
          </div>
          <div className="label mt-2">90% range (P5–P95)</div>
          <div className="num mt-1 text-sm font-medium text-fg-secondary">
            {px(f.quantiles.p05)} – {px(f.quantiles.p95)}
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          <Stat label="Anchor (last completed daily close)" value={`${px(f.inputs.anchorPrice)} · ${f.asOfDate}`} />
          <Stat label="Horizon" value={<span className="inline-flex items-center gap-1.5">{f.horizonDays} days <HorizonStatusBadge status={u.horizonStatus} /></span>} />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                Band width 50% / 90% <InfoTip text="(P75−P25)/P50 and (P95−P5)/P50. Wider = more uncertainty." />
              </span>
            }
            value={`${u.bandWidth50Pct.toFixed(1)}% / ${u.bandWidth90Pct.toFixed(1)}%`}
          />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                Sample size <InfoTip text="N daily returns in the bootstrap sample, and the number of non-overlapping historical windows of this horizon length." />
              </span>
            }
            value={`N=${u.returnSampleSize} · ${u.independentWindows} indep. windows`}
          />
          <Stat label="Training window" value={`${f.trainingStart} → ${f.trainingEnd}`} />
          <Stat label="Data provider" value={data.provenance.source} />
          <Stat label="Computed" value={formatDateTime(f.computedAt, "UTC")} />
        </div>
        <div className="rounded-lg border border-border-subtle p-2.5 text-2xs leading-relaxed text-fg-muted">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {pub.status === "published" ? (
              <Badge tone={pub.payloadVerified ? "success" : "warning"}>Published</Badge>
            ) : (
              <Badge tone="info">Computed now</Badge>
            )}
            <span className="text-fg-secondary">{pub.label}</span>
          </div>
          <div className="break-all font-mono">id-hash {pub.contentHash.slice(0, 16)}… · payload {pub.payloadHash.slice(0, 16)}…</div>
        </div>
        <button type="button" onClick={onMethodology} className="text-xs font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">
          View methodology & model card →
        </button>
        <p className="text-2xs text-fg-muted">{GLOSSARY.coverage}</p>
      </CardBody>
    </Card>
  );
}
