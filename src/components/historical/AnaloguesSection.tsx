"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { ClaimLabel } from "@/components/ui/Misc";
import { EmptyState } from "@/components/ui/States";
import { LineChart } from "@/components/charts/Charts";
import { utcDate } from "@/components/market/parts";
import { ANALOGUE_FEATURES, FEATURE_LABELS, findAnalogues, type AnalogueFeature, type FeatureVector } from "@/lib/analytics/analogues";
import { formatPct } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";
import { Note, Section } from "./Section";

const fmtFeature = (f: AnalogueFeature, v: number) => (f === "vol30" ? `${(v * 100).toFixed(0)}%` : formatPct((Math.exp(v) - 1) * 100, 1));

export function AnaloguesSection({ xrp }: { xrp: CandleSeries }) {
  const r = useMemo(() => findAnalogues(xrp.candles, { minGapDays: 180, separationDays: 90, top: 5 }), [xrp]);
  const paths = useMemo(() => {
    const rows: Record<string, number | null>[] = [];
    for (let d = 0; d <= 90; d++) rows.push({ day: d });
    r.analogues.forEach((a, k) => {
      const base = xrp.candles[a.index].c;
      for (let j = a.index; j < xrp.candles.length; j++) {
        const d = Math.round((xrp.candles[j].t - xrp.candles[a.index].t) / 86_400_000);
        if (d > 90) break;
        rows[d][`a${k}`] = (xrp.candles[j].c / base) * 100;
      }
    });
    return rows;
  }, [r, xrp]);

  return (
    <Section
      id="analogues"
      title="Historical analogues"
      icon={<Search className="h-4 w-4" />}
      subtitle={r.reference ? `Past dates most similar to ${utcDate(r.reference.t)} · ${r.candidates.toLocaleString("en-US")} candidate days compared` : "Past dates most similar to current conditions"}
      provenance={xrp.provenance}
      methodology={
        <>
          <p>
            Each date is described by five measurable features, each computed only from data available on that date: 30D return, 90D return, 30D realized volatility, distance from the 200D SMA, and drawdown from the running
            all-time high (returns and distances in log terms).
          </p>
          <p>
            Features are z-scored across all eligible dates. Distance = root-mean-square difference of z-scores versus the latest date; similarity score = 100 ÷ (1 + distance), so 100 would be identical conditions and 50 means
            one standard deviation apart on average. Only dates at least {r.params.minGapDays} days before the latest close are eligible, and the top {r.params.top} are chosen so no two are within {r.params.separationDays} days of
            each other.
          </p>
          <p>&quot;What happened next&quot; shows realized close-to-close returns 30 and 90 days after each analogue date and the largest decline within those 90 days. These are historical facts about those dates — not a forecast.</p>
        </>
      }
      footer={<span>Historical similarity does not imply future repetition</span>}
    >
      <p className="rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs font-medium text-accent-strong">Historical similarity does not imply future repetition.</p>
      {!r.reference || !r.analogues.length ? (
        <EmptyState title="Not enough history" description="At least ~400 daily closes are needed (200D SMA warm-up plus the 180-day exclusion window)." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="label py-1.5 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="label py-1.5 text-right font-medium">
                    Similarity
                  </th>
                  {ANALOGUE_FEATURES.map((f) => (
                    <th key={f} scope="col" className="label py-1.5 text-right font-medium">
                      {FEATURE_LABELS[f]}
                    </th>
                  ))}
                  <th scope="col" className="label py-1.5 text-right font-medium">
                    Next 30D
                  </th>
                  <th scope="col" className="label py-1.5 text-right font-medium">
                    Next 90D
                  </th>
                  <th scope="col" className="label py-1.5 text-right font-medium">
                    Max DD 90D
                  </th>
                </tr>
              </thead>
              <tbody>
                <FeatureRow label={<span className="font-semibold text-accent-strong">Latest · {utcDate(r.reference.t)}</span>} f={r.reference.features} highlight />
                {r.analogues.map((a) => (
                  <FeatureRow
                    key={a.t}
                    label={utcDate(a.t)}
                    f={a.features}
                    similarity={a.similarity}
                    fwd30={a.fwd30Pct}
                    fwd90={a.fwd90Pct}
                    dd={a.maxDd90Pct}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="label mb-1">What happened next — each analogue indexed to 100 on its date</div>
              <LineChart
                data={paths}
                x="day"
                series={r.analogues.map((a, k) => ({ key: `a${k}`, label: utcDate(a.t) }))}
                height={240}
                xFormat={(v) => `d${v}`}
                yFormat={(v) => v.toFixed(0)}
                refY={[{ y: 100 }]}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-border-subtle p-3 text-xs">
              <div className="flex items-center gap-2">
                <ClaimLabel kind="FACT" />
                <span className="font-medium text-fg">Outcomes of the {r.analogues.length} analogues</span>
              </div>
              <OutcomeLine label="30 days later" s={r.fwd30} />
              <OutcomeLine label="90 days later" s={r.fwd90} />
              <Note>
                A sample of {r.analogues.length} past episodes is far too small to estimate probabilities. The spread between best and worst outcomes is the most informative part.
              </Note>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

function OutcomeLine({ label, s }: { label: string; s: { n: number; median: number | null; min: number | null; max: number | null } }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num text-sm text-fg">
        median {formatPct(s.median, 1)} <span className="text-fg-muted">· range {formatPct(s.min, 0)} to {formatPct(s.max, 0)} · N={s.n}</span>
      </div>
    </div>
  );
}

function FeatureRow({
  label,
  f,
  similarity,
  fwd30,
  fwd90,
  dd,
  highlight,
}: {
  label: React.ReactNode;
  f: FeatureVector;
  similarity?: number;
  fwd30?: number | null;
  fwd90?: number | null;
  dd?: number | null;
  highlight?: boolean;
}) {
  const signed = (v: number | null | undefined) => <span className={cn(v === null || v === undefined ? "text-fg-muted" : v >= 0 ? "text-success" : "text-danger")}>{v === null || v === undefined ? "—" : formatPct(v, 1)}</span>;
  return (
    <tr className={cn("border-b border-border-subtle/60 last:border-0", highlight && "bg-accent/[0.05]")}>
      <th scope="row" className="whitespace-nowrap py-2 pr-2 text-left font-medium text-fg-secondary">
        {label}
      </th>
      <td className="py-2 text-right">
        {similarity !== undefined ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${similarity}%` }} />
            </span>
            {similarity.toFixed(0)}
          </span>
        ) : (
          <span className="text-fg-muted">ref</span>
        )}
      </td>
      {ANALOGUE_FEATURES.map((k) => (
        <td key={k} className="py-2 text-right text-fg">
          {fmtFeature(k, f[k])}
        </td>
      ))}
      <td className="py-2 text-right">{highlight ? <span className="text-fg-muted">unknown</span> : signed(fwd30)}</td>
      <td className="py-2 text-right">{highlight ? <span className="text-fg-muted">unknown</span> : signed(fwd90)}</td>
      <td className="py-2 text-right">{highlight ? <span className="text-fg-muted">—</span> : signed(dd)}</td>
    </tr>
  );
}
