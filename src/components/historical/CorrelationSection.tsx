"use client";

import { useMemo } from "react";
import { Link2 } from "lucide-react";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { EmptyState } from "@/components/ui/States";
import { LineChart } from "@/components/charts/Charts";
import { downsample, monthYear, utcDate } from "@/components/market/parts";
import { alignedLogReturns, correlationWindows, describeCorrelation, rollingCorrelation, type WindowCorrelation } from "@/lib/analytics/correlation";
import type { CandleSeries } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";
import { Note, Section } from "./Section";

const WINDOWS = [30, 90, 180, 365];

export function CorrelationSection({ xrp, btc, eth }: { xrp: CandleSeries; btc: CandleSeries | null; eth: CandleSeries | null }) {
  const data = useMemo(() => {
    const mk = (other: CandleSeries | null) => {
      if (!other) return null;
      const pairs = alignedLogReturns(xrp.candles, other.candles);
      return { pairs, windows: correlationWindows(pairs, WINDOWS), rolling: rollingCorrelation(pairs, 90) };
    };
    return { btc: mk(btc), eth: mk(eth) };
  }, [xrp, btc, eth]);

  const rows = useMemo(() => {
    const m = new Map<number, { t: number; btc?: number | null; eth?: number | null }>();
    data.btc?.rolling.forEach((r) => r.r !== null && m.set(r.t, { ...(m.get(r.t) ?? { t: r.t }), btc: r.r }));
    data.eth?.rolling.forEach((r) => r.r !== null && m.set(r.t, { ...(m.get(r.t) ?? { t: r.t }), eth: r.r }));
    return downsample(
      [...m.values()].sort((a, b) => a.t - b.t),
      700,
    );
  }, [data]);

  const sources = [xrp.provenance.source, btc?.provenance.source, eth?.provenance.source].filter(Boolean).join(" · ");

  return (
    <Section
      id="correlation"
      title="Correlation with BTC & ETH"
      icon={<Link2 className="h-4 w-4" />}
      info={GLOSSARY.correlation}
      subtitle="Pearson correlation of daily log returns · trailing calendar windows"
      provenance={xrp.provenance}
      footer={<span className="truncate">{sources}</span>}
      methodology={
        <>
          <p>
            Daily log returns are aligned by UTC date; a return pair is used only when both assets have closes on the same two consecutive days (no forward-filling). ρ is the Pearson coefficient over the pairs in the trailing
            window ending at the latest common date; N is the number of pairs. A window needs at least half its days to be reported.
          </p>
          <p>β (beta) = cov(XRP, other) ÷ var(other): the average XRP log move per 1-unit log move of the other asset in that window.</p>
          <p>
            <strong>Correlation does not prove causation.</strong> Co-movement can reflect shared market-wide drivers, and correlations change over time — see the rolling chart.
          </p>
        </>
      }
    >
      {!data.btc && !data.eth ? (
        <EmptyState title="Comparison history unavailable" description="BTC-USD and ETH-USD daily history could not be loaded, so correlations cannot be computed." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="label py-1.5 text-left font-medium">
                    Pair
                  </th>
                  {WINDOWS.map((w) => (
                    <th key={w} scope="col" className="label py-1.5 text-right font-medium">
                      {w === 365 ? "1Y" : `${w}D`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.btc && <CorrRow label="XRP / BTC" w={data.btc.windows} />}
                {data.eth && <CorrRow label="XRP / ETH" w={data.eth.windows} />}
              </tbody>
            </table>
          </div>
          <div>
            <div className="label mb-1">Rolling 90D correlation</div>
            <LineChart
              data={rows}
              x="t"
              series={[
                ...(data.btc ? [{ key: "btc", label: "XRP / BTC" }] : []),
                ...(data.eth ? [{ key: "eth", label: "XRP / ETH", dashed: true }] : []),
              ]}
              height={240}
              xFormat={monthYear}
              yFormat={(v) => v.toFixed(2)}
              refY={[{ y: 0 }]}
            />
          </div>
          <Note>
            Correlation does not imply causation. Latest common date: {utcDate(data.btc?.windows[0].end ?? data.eth?.windows[0].end ?? null)}. {!btc && "BTC history unavailable. "}
            {!eth && "ETH history unavailable."}
          </Note>
        </>
      )}
    </Section>
  );
}

function CorrRow({ label, w }: { label: string; w: WindowCorrelation[] }) {
  return (
    <tr className="border-b border-border-subtle/60 last:border-0 align-top">
      <th scope="row" className="py-2 text-left text-xs font-medium text-fg-secondary">
        {label}
      </th>
      {w.map((x) => (
        <td key={x.windowDays} className="py-2 text-right">
          <span className={cn("block text-base font-semibold", x.r === null ? "text-fg-muted" : "text-fg")} title={describeCorrelation(x.r)}>
            {x.r === null ? "—" : x.r.toFixed(2)}
          </span>
          <span className="block text-2xs text-fg-muted">
            N={x.n}
            {x.beta !== null ? ` · β ${x.beta.toFixed(2)}` : ""}
          </span>
        </td>
      ))}
    </tr>
  );
}
