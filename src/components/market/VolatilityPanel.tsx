"use client";

import { useMemo } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshness, SourceLine } from "@/components/ui/DataFreshness";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { LineChart } from "@/components/charts/Charts";
import { useDailyHistory } from "@/hooks/useMarketData";
import { volatilityHistory } from "@/lib/analytics/history";
import { AsyncBlock, monthYear, PercentileBar, TrendArrow } from "./parts";
import { trendOf } from "@/lib/analytics/history";

const BAND_TONE = { LOW: "info", NORMAL: "success", ELEVATED: "warning", EXTREME: "danger" } as const;

/** 30D realized volatility, percentile vs full history, and the last year of rolling vol. */
export function VolatilityPanel({ className }: { className?: string }) {
  const h = useDailyHistory("XRP-USD");
  const v = useMemo(() => (h.data ? volatilityHistory(h.data.candles) : null), [h.data]);
  const rows = useMemo(
    () =>
      (v?.series ?? [])
        .slice(-365)
        .map((s) => ({ t: s.t, vol30: s.vol30 !== null ? s.vol30 * 100 : null, vol90: s.vol90 !== null ? s.vol90 * 100 : null })),
    [v],
  );
  const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(0)}%`);
  return (
    <Card className={className}>
      <CardHeader
        title="Volatility"
        subtitle="XRP/USD · realized, annualized"
        info={GLOSSARY.volatility}
        actions={<DataFreshness provenance={h.data?.provenance} timestamp={h.data?.provenance.fetchedAt} kind="daily" />}
      />
      <CardBody>
        <AsyncBlock loading={h.loading} error={h.error} hasData={!!v} onRetry={h.reload} lastUpdated={h.updatedAt} height={220}>
          {v && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label">30D realized</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="num text-2xl font-semibold text-fg">{pct(v.current30)}</span>
                    <TrendArrow trend={trendOf(v.current30, v.prev30, 0.05)} note="30D vol vs 30 days ago" />
                  </div>
                  {v.band30 && (
                    <Badge tone={BAND_TONE[v.band30]} className="mt-1">
                      {v.band30}
                    </Badge>
                  )}
                </div>
                <div>
                  <div className="label">90D realized</div>
                  <div className="num mt-0.5 text-2xl font-semibold text-fg">{pct(v.current90)}</div>
                  <div className="mt-1 text-2xs text-fg-muted">percentile P{v.pct90?.toFixed(0) ?? "—"}</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="label mb-1">30D percentile vs history (N = {v.samples30.toLocaleString("en-US")} days)</div>
                <PercentileBar value={v.pct30} />
              </div>
              <div className="mt-3">
                <LineChart
                  data={rows}
                  x="t"
                  series={[
                    { key: "vol30", label: "30D" },
                    { key: "vol90", label: "90D", dashed: true },
                  ]}
                  height={150}
                  xFormat={monthYear}
                  yFormat={(n) => `${n.toFixed(0)}%`}
                  refY={v.q90 !== null ? [{ y: v.q90 * 100, label: "P90" }] : undefined}
                />
              </div>
            </>
          )}
        </AsyncBlock>
      </CardBody>
      <CardFooter className="flex-wrap">
        <SourceLine provenance={h.data?.provenance} />
        <span>Last 365 days shown · bands from full history</span>
      </CardFooter>
    </Card>
  );
}
