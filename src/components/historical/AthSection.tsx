"use client";

import { useMemo, useState } from "react";
import { Mountain } from "lucide-react";
import { TrustBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { InfoTip } from "@/components/ui/Tooltip";
import { LineChart } from "@/components/charts/Charts";
import { Chip, downsample, monthYear, utcDate } from "@/components/market/parts";
import { athAnalysis } from "@/lib/analytics/history";
import { formatDays, formatNumber, formatPct, formatPrice } from "@/lib/format";
import type { CandleSeries, MarketSnapshot } from "@/lib/types/market";
import type { ApiError } from "@/hooks/useApi";
import { Fig, Note, Section } from "./Section";

export function AthSection({ xrp, snapshot }: { xrp: CandleSeries; snapshot: { data?: MarketSnapshot; error: ApiError | null; loading: boolean } }) {
  const a = useMemo(() => athAnalysis(xrp.candles), [xrp]);
  const [log, setLog] = useState(true);
  const rows = useMemo(() => downsample(xrp.candles.map((k) => ({ t: k.t, close: k.c })), 800, "close", "max"), [xrp]);
  if (!a) return null;
  const snap = snapshot.data;
  const src = xrp.provenance.source;
  return (
    <Section
      id="ath"
      title="All-time high analysis"
      icon={<Mountain className="h-4 w-4" />}
      subtitle={`Within dataset: ${src}, ${utcDate(a.datasetStart)} → ${utcDate(a.datasetEnd)} (${formatNumber(a.n, 0)} daily closes)`}
      provenance={xrp.provenance}
      actions={
        <div className="flex gap-1">
          <Chip active={log} onClick={() => setLog(true)}>
            Log
          </Chip>
          <Chip active={!log} onClick={() => setLog(false)}>
            Linear
          </Chip>
        </div>
      }
      methodology={
        <>
          <p>
            The dataset ATH is the highest <strong>daily close</strong> in the loaded series from a single provider ({src}); the intraday ATH is the highest daily high. Figures only cover the period in the dataset
            (from {utcDate(a.datasetStart)}) and can differ from other venues or aggregated indices.
          </p>
          <p>Drawdown from ATH = latest close ÷ ATH close − 1. Distance to ATH = gain required from the latest close to reach the ATH close. Days since ATH are calendar days (UTC).</p>
          <p>Reclaim time = calendar days from a prior ATH close until the first close at or above it, for declines of at least 20%. Reaching an ATH again is not implied by any of these figures.</p>
        </>
      }
      footer={<span>Past highs are not targets</span>}
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Fig label="ATH (close)" value={formatPrice(a.athClose, "USD")} sub={utcDate(a.athCloseT)} />
        <Fig label="ATH (intraday)" value={formatPrice(a.athHigh, "USD")} sub={utcDate(a.athHighT)} />
        <Fig label="Days since ATH" value={formatNumber(a.daysSinceAth, 0)} sub={formatDays(a.daysSinceAth)} />
        <Fig label="Drawdown from ATH" value={formatPct(a.drawdownFromAthPct, 1)} tone={a.drawdownFromAthPct < 0 ? "down" : "neutral"} sub={`Latest close ${formatPrice(a.lastClose, "USD")}`} />
        <Fig label="Distance to ATH" value={formatPct(a.distanceToAthPct, 1)} sub="Gain needed to reach ATH close" />
        <Fig
          label="Last reclaim"
          value={a.lastReclaim ? formatDays(a.lastReclaim.daysToReclaim) : "—"}
          sub={a.lastReclaim ? `${utcDate(a.lastReclaim.peakT)} ATH reclaimed ${utcDate(a.lastReclaim.reclaimT)} after ${formatPct(a.lastReclaim.depthPct, 0)}` : "No ≥20% decline was reclaimed in the dataset"}
        />
      </div>
      <div className="rounded-lg border border-border-subtle p-3">
        <div className="flex flex-wrap items-center gap-2">
          <TrustBadge kind="EXTERNAL" />
          <span className="text-xs font-medium text-fg">CoinGecko aggregated ATH</span>
          <InfoTip text="CoinGecko aggregates prices across many exchanges and may include earlier data or venue spikes, so its ATH can differ from our single-provider dataset." />
        </div>
        {snapshot.loading && !snap ? (
          <Skeleton className="mt-2 h-5 w-64" />
        ) : snap?.athUsd ? (
          <p className="num mt-1 text-sm text-fg-secondary">
            {formatPrice(snap.athUsd, "USD")} on {snap.athDate ? utcDate(Date.parse(snap.athDate)) : "—"}
            <span className="text-fg-muted"> · difference vs dataset intraday ATH {formatPct((snap.athUsd / a.athHigh - 1) * 100, 1)}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">External reference unavailable right now{snapshot.error ? ` (${snapshot.error.message})` : ""}.</p>
        )}
      </div>
      <div>
        <LineChart
          data={rows}
          x="t"
          series={[{ key: "close", label: "Daily close (USD)" }]}
          height={260}
          area={!log}
          logScale={log}
          xFormat={monthYear}
          yFormat={(v) => formatPrice(v, "USD")}
          refY={[{ y: a.athClose, label: `ATH close ${formatPrice(a.athClose, "USD")}` }]}
        />
        <Note className="mt-1">Chart down-sampled for display (bucket maxima preserved). {a.longestUnderwater ? `Longest stretch below a prior ATH: ${formatDays(a.longestUnderwater.days)}${a.longestUnderwater.ongoing ? " (ongoing)" : ""}, from ${utcDate(a.longestUnderwater.peakT)}.` : ""}</Note>
      </div>
    </Section>
  );
}
