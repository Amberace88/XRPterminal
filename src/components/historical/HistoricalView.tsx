"use client";

import { useMemo, useState } from "react";
import { Database } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { MetricCard } from "@/components/ui/MetricCard";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { QualityFlags, utcDate } from "@/components/market/parts";
import { useDailyHistory, useSnapshot } from "@/hooks/useMarketData";
import { athAnalysis, volatilityHistory } from "@/lib/analytics/history";
import { alignedLogReturns, correlationWindows } from "@/lib/analytics/correlation";
import { formatDays, formatNumber, formatPct, formatPrice } from "@/lib/format";
import { AthSection } from "./AthSection";
import { CycleComparisonSection, CyclesSection } from "./CyclesSection";
import { DrawdownSection, RecoverySection } from "./DrawdownSection";
import { VolatilitySection } from "./VolatilitySection";
import { SeasonalitySection } from "./SeasonalitySection";
import { CorrelationSection } from "./CorrelationSection";
import { ZonesSection } from "./ZonesSection";
import { AnaloguesSection } from "./AnaloguesSection";
import { StressSection } from "./StressSection";

const NAV = [
  ["ath", "ATH"],
  ["cycles", "Cycles"],
  ["cycle-comparison", "Cycle comparison"],
  ["drawdowns", "Drawdowns"],
  ["recovery", "Recovery"],
  ["volatility", "Volatility"],
  ["seasonality", "Seasonality"],
  ["correlation", "Correlation"],
  ["zones", "Reaction zones"],
  ["analogues", "Analogues"],
  ["stress", "Stress test"],
] as const;

export function HistoricalView() {
  const xrp = useDailyHistory("XRP-USD");
  const btc = useDailyHistory("BTC-USD");
  const eth = useDailyHistory("ETH-USD");
  const snap = useSnapshot("XRP");
  const [preset, setPreset] = useState("standard");
  const series = xrp.data && xrp.data.candles.length > 1 ? xrp.data : null;

  const kpi = useMemo(() => {
    if (!series) return null;
    const a = athAnalysis(series.candles);
    const v = volatilityHistory(series.candles);
    const corr = btc.data ? correlationWindows(alignedLogReturns(series.candles, btc.data.candles), [90])[0] : null;
    return { a, v, corr };
  }, [series, btc.data]);

  if (!series) {
    return (
      <div className="space-y-4">
        {xrp.error ? (
          <Card>
            <ErrorState title="Historical data unavailable" message={xrp.error.message} onRetry={xrp.reload} lastUpdated={xrp.updatedAt} />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-72" />
            <Skeleton className="h-96" />
          </>
        )}
      </div>
    );
  }

  const first = series.candles[0].t;
  const last = series.candles[series.candles.length - 1].t;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col gap-2 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:pt-4">
          <div className="flex min-w-0 items-start gap-2 text-fg-secondary">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              Dataset: <strong className="font-medium text-fg">{series.provenance.source}</strong> daily closes, {utcDate(first)} → {utcDate(last)} ({formatNumber(series.candles.length, 0)} days, UTC). Single provider,
              never stitched. BTC/ETH comparisons: {btc.data?.provenance.source ?? (btc.loading ? "loading…" : "unavailable")} / {eth.data?.provenance.source ?? (eth.loading ? "loading…" : "unavailable")}.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <QualityFlags flags={series.qualityFlags} />
            <DataFreshness provenance={series.provenance} timestamp={series.provenance.fetchedAt} kind="daily" />
          </div>
        </CardBody>
      </Card>

      {kpi?.a && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard label="Dataset ATH (close)" value={formatPrice(kpi.a.athClose, "USD")} sub={utcDate(kpi.a.athCloseT)} />
          <MetricCard label="From ATH" value={formatPct(kpi.a.drawdownFromAthPct, 1)} deltaTone="down" info={GLOSSARY.drawdown} sub={`${formatDays(kpi.a.daysSinceAth)} since ATH`} />
          <MetricCard label="30D volatility" value={kpi.v.current30 !== null ? `${(kpi.v.current30 * 100).toFixed(0)}%` : "—"} sub={kpi.v.pct30 !== null ? `P${kpi.v.pct30.toFixed(0)} of history · ${kpi.v.band30}` : undefined} info={GLOSSARY.volatility} />
          <MetricCard label="90D ρ vs BTC" value={kpi.corr?.r != null ? kpi.corr.r.toFixed(2) : "—"} sub={kpi.corr ? `N = ${kpi.corr.n} daily pairs` : btc.loading ? "Loading BTC…" : "BTC unavailable"} info={GLOSSARY.correlation} />
          <MetricCard label="Latest close" value={formatPrice(kpi.a.lastClose, "USD")} sub={utcDate(kpi.a.lastT)} className="col-span-2 lg:col-span-1" />
        </div>
      )}

      <nav aria-label="Sections" className="sticky top-14 z-10 -mx-1 overflow-x-auto rounded-lg border border-border-subtle bg-bg/85 px-1 py-1 backdrop-blur">
        <ul className="flex gap-1">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block whitespace-nowrap rounded-md px-2.5 py-1 text-2xs font-medium text-fg-muted hover:bg-surface-hover hover:text-fg">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <AthSection xrp={series} snapshot={snap} />
      <CyclesSection xrp={series} presetId={preset} onPreset={setPreset} />
      <CycleComparisonSection xrp={series} presetId={preset} />
      <div className="grid gap-4 xl:grid-cols-2">
        <DrawdownSection xrp={series} />
        <RecoverySection xrp={series} />
      </div>
      <VolatilitySection xrp={series} />
      <SeasonalitySection xrp={series} />
      {btc.error && eth.error ? (
        <Card>
          <ErrorState title="BTC/ETH history unavailable" message="Correlation needs BTC-USD or ETH-USD daily history." onRetry={() => (btc.reload(), eth.reload())} compact />
        </Card>
      ) : btc.loading && !btc.data && eth.loading && !eth.data ? (
        <Skeleton className="h-80" />
      ) : (
        <CorrelationSection xrp={series} btc={btc.data ?? null} eth={eth.data ?? null} />
      )}
      <ZonesSection xrp={series} />
      <AnaloguesSection xrp={series} />
      <StressSection xrp={series} btc={btc.data ?? null} />
    </div>
  );
}
