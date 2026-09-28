"use client";

import { useMemo } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshness, SourceLine } from "@/components/ui/DataFreshness";
import { InfoTip } from "@/components/ui/Tooltip";
import { useDailyHistory } from "@/hooks/useMarketData";
import { computeMarketHealth, liquidityComponent, type HealthComponent, type LiveBookInput, type MarketHealth } from "@/lib/analytics/health";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { AsyncBlock, Methodology, PercentileBar, TONE_BADGE, TrendArrow } from "./parts";

/** Load XRP + BTC daily history and compute market health (memoized). */
export function useMarketHealth(liveBook?: LiveBookInput | null) {
  const xrp = useDailyHistory("XRP-USD");
  const btc = useDailyHistory("BTC-USD");
  // heavy daily computation — only when history changes
  const base = useMemo<MarketHealth | null>(
    () => (xrp.data && xrp.data.candles.length > 30 ? computeMarketHealth(xrp.data.candles, btc.data?.candles ?? null, null) : null),
    [xrp.data, btc.data],
  );
  // live liquidity is merged cheaply on every book update
  const health = useMemo<MarketHealth | null>(
    () => (base && liveBook ? { ...base, components: base.components.map((c) => (c.id === "liquidity" ? liquidityComponent(liveBook) : c)) } : base),
    [base, liveBook],
  );
  return { xrp, btc, health };
}

export function HealthRow({ c, compact }: { c: HealthComponent; compact?: boolean }) {
  return (
    <div className={cn("grid items-center gap-x-3 gap-y-1 border-b border-border-subtle/60 py-2 last:border-0", compact ? "grid-cols-[1fr_auto]" : "grid-cols-2 sm:grid-cols-[1.1fr_1.2fr_1fr_0.9fr_auto]")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-medium", c.available ? "text-fg" : "text-fg-muted")}>{c.name}</span>
          <InfoTip text={`${c.detail}${c.basis ? ` Percentile basis: ${c.basis}.` : ""}`} />
        </div>
        {!compact && <div className="num truncate text-2xs text-fg-muted">{c.value}</div>}
      </div>
      <div className={cn(compact ? "text-right" : "")}>
        <Badge tone={TONE_BADGE[c.tone]}>{c.condition}</Badge>
        {compact && c.available && <div className="num mt-0.5 text-2xs text-fg-muted">{c.value}</div>}
      </div>
      {!compact && (
        <>
          <div>{c.available ? <PercentileBar value={c.percentile} /> : <span className="text-2xs text-fg-muted">—</span>}</div>
          <div>{c.available ? <TrendArrow trend={c.trend} note={c.trendNote} /> : <span className="text-2xs text-fg-muted">—</span>}</div>
          <div className="num text-right text-2xs text-fg-muted">{c.asOf ? formatDateTime(c.asOf, "UTC", false) : "—"}</div>
        </>
      )}
    </div>
  );
}

export function MarketHealthPanel({ liveBook, className }: { liveBook?: LiveBookInput | null; className?: string }) {
  const { xrp, btc, health } = useMarketHealth(liveBook);
  return (
    <Card className={className} id="health">
      <CardHeader
        title="Market health"
        subtitle="Current condition · historical percentile · trend · timestamp"
        info="Each component compares today's measurable condition with its own history. It describes the present — it is not a forecast."
        actions={<DataFreshness provenance={xrp.data?.provenance} timestamp={xrp.data?.provenance.fetchedAt} kind="daily" />}
      />
      <CardBody>
        <AsyncBlock loading={xrp.loading} error={xrp.error} hasData={!!health} onRetry={xrp.reload} lastUpdated={xrp.updatedAt} height={320}>
          {health ? (
            <>
              <div className="hidden grid-cols-[1.1fr_1.2fr_1fr_0.9fr_auto] gap-x-3 border-b border-border-subtle pb-1.5 sm:grid">
                <span className="label">Component</span>
                <span className="label">Condition</span>
                <span className="label">Hist. percentile</span>
                <span className="label">Trend</span>
                <span className="label text-right">As of (UTC)</span>
              </div>
              {health.components.map((c) => (
                <HealthRow key={c.id} c={c} />
              ))}
              {health.regime.regime !== "UNKNOWN" && <p className="mt-3 text-xs leading-relaxed text-fg-secondary">{health.regime.explanation}</p>}
              <Methodology className="mt-3">
                <p>Daily components use the full daily XRP/USD history from one provider ({xrp.data?.provenance.source}). Percentiles rank today&apos;s value within that component&apos;s own history (0 = lowest, 100 = highest).</p>
                <p>Volatility: 30D annualized realized volatility; bands &lt;P25 calm, P25–75 normal, P75–90 elevated, ≥P90 extreme. Volume: 30D average quote volume on the history venue. Momentum: RSI(14) and 30D return. Trend: close vs 50D/200D SMA. Correlation: rolling 90D Pearson correlation of daily log returns with BTC ({btc.data ? btc.data.provenance.source : "BTC history unavailable"}). Regime &amp; risk: {health.regime.methodologyVersion} rules and the weighted risk score.</p>
                <p>Liquidity uses the live order book when connected and has no stored history, so no percentile is shown. XRPL activity, exchange flows and concentration come from the XRPL module and are not connected here.</p>
              </Methodology>
            </>
          ) : null}
        </AsyncBlock>
      </CardBody>
      <CardFooter className="flex-wrap">
        <SourceLine provenance={xrp.data?.provenance} />
        <span>Not investment advice</span>
      </CardFooter>
    </Card>
  );
}
