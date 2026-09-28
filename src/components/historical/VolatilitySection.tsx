"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { LineChart } from "@/components/charts/Charts";
import { downsample, monthYear, PercentileBar, TrendArrow, utcDate } from "@/components/market/parts";
import { trendOf, volatilityHistory } from "@/lib/analytics/history";
import type { CandleSeries } from "@/lib/types/market";
import { Fig, Note, Section } from "./Section";

const BAND_TONE = { LOW: "info", NORMAL: "success", ELEVATED: "warning", EXTREME: "danger" } as const;

export function VolatilitySection({ xrp }: { xrp: CandleSeries }) {
  const v = useMemo(() => volatilityHistory(xrp.candles), [xrp]);
  const rows = useMemo(
    () =>
      downsample(
        v.series.filter((s) => s.vol30 !== null).map((s) => ({ t: s.t, vol30: (s.vol30 as number) * 100, vol90: s.vol90 !== null ? s.vol90 * 100 : null })),
        800,
        "vol30",
        "max",
      ),
    [v],
  );
  const p = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(0)}%`);
  return (
    <Section
      id="volatility"
      title="Volatility history"
      icon={<Activity className="h-4 w-4" />}
      info={GLOSSARY.volatility}
      subtitle={`Rolling realized volatility · N = ${v.samples30.toLocaleString("en-US")} daily 30D observations`}
      provenance={xrp.provenance}
      methodology={
        <>
          <p>Realized volatility = standard deviation of daily log returns over the trailing window × √365 (crypto trades every day). A window needs at least 80% of its returns present.</p>
          <p>Percentile ranks today&apos;s value against every past value of the same window. Regime bands: below P25 low, P25–P75 normal, P75–P90 elevated, at or above P90 extreme. Bands are relative to XRP&apos;s own history, not to other assets.</p>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Fig
          label="30D realized"
          value={
            <span className="flex items-center gap-2">
              {p(v.current30)} <TrendArrow trend={trendOf(v.current30, v.prev30, 0.05)} note="vs 30 days ago" />
            </span>
          }
          sub={v.band30 ? <Badge tone={BAND_TONE[v.band30]}>{v.band30}</Badge> : undefined}
        />
        <Fig label="30D percentile" value={v.pct30 !== null ? `P${v.pct30.toFixed(0)}` : "—"} sub={<PercentileBar value={v.pct30} showLabel={false} />} />
        <Fig label="90D realized" value={p(v.current90)} sub={v.pct90 !== null ? `P${v.pct90.toFixed(0)} of history` : undefined} />
        <Fig label="30D median (history)" value={p(v.q50)} sub={`P25 ${p(v.q25)} · P75 ${p(v.q75)} · P90 ${p(v.q90)}`} />
      </div>
      <LineChart
        data={rows}
        x="t"
        series={[
          { key: "vol30", label: "30D" },
          { key: "vol90", label: "90D", dashed: true },
        ]}
        height={260}
        xFormat={monthYear}
        yFormat={(n) => `${n.toFixed(0)}%`}
        refY={[
          ...(v.q25 !== null ? [{ y: v.q25 * 100, label: "P25" }] : []),
          ...(v.q75 !== null ? [{ y: v.q75 * 100, label: "P75" }] : []),
          ...(v.q90 !== null ? [{ y: v.q90 * 100, label: "P90" }] : []),
        ]}
      />
      <Note>
        Highest 30D volatility in the dataset: {v.max30 ? `${(v.max30.v * 100).toFixed(0)}% on ${utcDate(v.max30.t)}` : "—"}. Lowest: {v.min30 ? `${(v.min30.v * 100).toFixed(0)}% on ${utcDate(v.min30.t)}` : "—"}. Chart
        down-sampled (bucket maxima preserved).
      </Note>
    </Section>
  );
}
