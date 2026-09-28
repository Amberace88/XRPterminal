"use client";

import { useMemo, useState } from "react";
import { TrendingDown, Undo2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { GLOSSARY, InfoTip } from "@/components/ui/Tooltip";
import { BarChart, LineChart } from "@/components/charts/Charts";
import { tokenColor } from "@/components/charts/theme";
import { downsample, monthYear, utcDate } from "@/components/market/parts";
import { drawdownSeries, drawdownStats, recoveryStats, swingDeclines, type DeclineEpisode, type Summary } from "@/lib/analytics/history";
import { formatDays, formatNumber, formatPct, formatPrice } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { Fig, Note, SampleWarning, Section } from "./Section";

const THRESHOLDS = ["20", "30", "50"] as const;
type Th = (typeof THRESHOLDS)[number];

const STATUS_TONE = { recovered: "success", unrecovered: "warning", ongoing: "accent" } as const;

const epCols: Column<DeclineEpisode>[] = [
  { key: "peak", header: "Peak", cell: (e) => <Cell a={utcDate(e.peakT)} b={formatPrice(e.peak, "USD")} />, value: (e) => e.peakT },
  { key: "trough", header: "Trough", cell: (e) => <Cell a={utcDate(e.troughT)} b={formatPrice(e.trough, "USD")} />, value: (e) => e.troughT },
  { key: "depth", header: "Depth", align: "right", cell: (e) => <span className="text-danger">{formatPct(e.depthPct, 1)}</span>, value: (e) => e.depthPct },
  { key: "decl", header: "Decline", align: "right", hideBelow: "sm", cell: (e) => `${formatNumber(e.declineDays, 0)}d`, value: (e) => e.declineDays },
  { key: "rec", header: "Recovery", align: "right", cell: (e) => (e.recoveryDays !== null ? `${formatNumber(e.recoveryDays, 0)}d` : "—"), value: (e) => e.recoveryDays },
  { key: "gain", header: "Gain needed", align: "right", hideBelow: "md", cell: (e) => formatPct(e.recoveryGainPct, 0), value: (e) => e.recoveryGainPct },
  { key: "status", header: "Status", cell: (e) => <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>, value: (e) => e.status },
];

function Cell({ a, b }: { a: string; b: string }) {
  return (
    <span className="block whitespace-nowrap">
      {a}
      <span className="num block text-2xs text-fg-muted">{b}</span>
    </span>
  );
}

export function DrawdownSection({ xrp }: { xrp: CandleSeries }) {
  const [th, setTh] = useState<Th>("20");
  const episodes = useMemo(() => swingDeclines(xrp.candles, Number(th)), [xrp, th]);
  const stats = useMemo(() => drawdownStats(xrp.candles, episodes), [xrp, episodes]);
  const underwater = useMemo(() => downsample(drawdownSeries(xrp.candles).map((d) => ({ t: d.t, dd: d.dd })), 800, "dd", "min"), [xrp]);
  const d = stats.depth;
  return (
    <Section
      id="drawdowns"
      title="Drawdown analysis"
      icon={<TrendingDown className="h-4 w-4" />}
      info={GLOSSARY.drawdown}
      subtitle={`Swing declines ≥ ${th}% · N = ${stats.episodes} episode(s) over ${stats.years.toFixed(1)} years`}
      provenance={xrp.provenance}
      actions={<Tabs ariaLabel="Decline threshold" size="xs" value={th} onChange={setTh} items={THRESHOLDS.map((t) => ({ value: t, label: `≥${t}%` }))} />}
      methodology={
        <>
          <p>
            Episodes are swing declines found with a symmetric {th}% zig-zag on daily closes: a swing high is confirmed when price falls {th}% from it, and the decline ends at the lowest close before a {th}% rebound. Depth = trough ÷
            swing high − 1.
          </p>
          <p>
            Recovery = calendar days from the trough to the first close at or above the swing high. Episodes that have not regained their high are counted in N but excluded from recovery statistics (censored). &quot;Ongoing&quot;
            means the trough is not yet confirmed.
          </p>
          <p>Underwater chart and time-underwater shares measure the close relative to the running all-time closing high since the dataset start.</p>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Fig label="Max drawdown" value={formatPct(d.min, 1)} tone="down" sub={`Deepest ≥${th}% swing (N=${d.n})`} />
        <Fig label="Average / median" value={`${formatPct(d.mean, 0)} / ${formatPct(d.median, 0)}`} sub={`N = ${d.n}`} />
        <Fig
          label="Median recovery"
          value={stats.recoveryDays.median !== null ? formatDays(stats.recoveryDays.median) : "—"}
          sub={`${stats.recoveredCount} recovered · ${stats.unrecoveredCount} not (yet)`}
        />
        <Fig label="Frequency" value={stats.perYear !== null ? `${stats.perYear.toFixed(1)} / yr` : "—"} sub={`${stats.episodes} episodes in ${stats.years.toFixed(1)} years`} />
        <Fig label="Current drawdown" value={formatPct(stats.currentDrawdownPct, 1)} tone={stats.currentDrawdownPct < 0 ? "down" : "neutral"} sub="vs running all-time closing high" />
        <Fig label="Time underwater" value={`${stats.underwaterSharePct.toFixed(0)}%`} sub="of days below the running ATH" />
        <Fig label="≥20% below ATH" value={`${stats.below20SharePct.toFixed(0)}%`} sub="of days" />
        <Fig label="≥50% below ATH" value={`${stats.below50SharePct.toFixed(0)}%`} sub="of days" />
      </div>
      {d.n > 0 && d.n < 5 && <SampleWarning>Small sample (N = {d.n}). Averages over so few episodes are not reliable.</SampleWarning>}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="label">Underwater chart — % below running all-time closing high</span>
          <InfoTip text="0% = a new all-time closing high on that day. Down-sampled for display; bucket minima are preserved so troughs are not hidden." />
        </div>
        <LineChart data={underwater} x="t" series={[{ key: "dd", label: "Drawdown", color: tokenColor("danger") }]} area height={220} xFormat={monthYear} yFormat={(v) => `${v.toFixed(0)}%`} />
      </div>
      <div>
        <div className="label mb-1">Episodes ({episodes.length})</div>
        <DataTable rows={[...episodes].reverse()} columns={epCols} rowKey={(e) => String(e.peakT)} csvName={`xrp-drawdowns-${th}pct`} pageSize={10} empty={{ title: "No episodes", description: `No declines of ${th}% or more in the dataset.` }} />
      </div>
    </Section>
  );
}

function SummaryRow({ label, s, fmt, unit }: { label: string; s: Summary; fmt: (v: number | null) => string; unit?: string }) {
  return (
    <tr className="border-b border-border-subtle/60 last:border-0">
      <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-fg-secondary">
        {label}
        {unit && <span className="text-fg-muted"> ({unit})</span>}
      </th>
      <td className="num py-2 text-right text-fg">{fmt(s.median)}</td>
      <td className="num py-2 text-right text-fg">{fmt(s.mean)}</td>
      <td className="num py-2 text-right text-fg-secondary">{fmt(s.min)}</td>
      <td className="num py-2 text-right text-fg-secondary">{fmt(s.max)}</td>
      <td className="num py-2 text-right text-fg-muted">{s.n}</td>
    </tr>
  );
}

export function RecoverySection({ xrp }: { xrp: CandleSeries }) {
  const [th, setTh] = useState<Th>("20");
  const episodes = useMemo(() => swingDeclines(xrp.candles, Number(th)), [xrp, th]);
  const r = useMemo(() => recoveryStats(episodes), [episodes]);
  const bars = useMemo(
    () => episodes.filter((e) => e.status === "recovered").map((e) => ({ t: e.peakT, days: e.recoveryDays as number, depth: Math.round(e.depthPct) })),
    [episodes],
  );
  const days = (v: number | null) => (v === null ? "—" : formatNumber(v, 0));
  const pct = (v: number | null) => (v === null ? "—" : formatPct(v, 0));
  const cv = r.days.stdev !== null && r.days.mean ? r.days.stdev / r.days.mean : null;
  return (
    <Section
      id="recovery"
      title="Recovery analysis"
      icon={<Undo2 className="h-4 w-4" />}
      subtitle={`How long it took XRP to regain prior swing highs after declines ≥ ${th}%`}
      provenance={xrp.provenance}
      actions={<Tabs ariaLabel="Decline threshold" size="xs" value={th} onChange={setTh} items={THRESHOLDS.map((t) => ({ value: t, label: `≥${t}%` }))} />}
      methodology={
        <>
          <p>Uses the same swing-decline episodes as the drawdown analysis. Only recovered episodes enter the statistics; {r.censored} episode(s) have not regained their swing high and are excluded (right-censored), which biases the averages toward shorter recoveries.</p>
          <p>Recovery magnitude = gain required from the trough to regain the swing high (peak ÷ trough − 1). Variability is summarized by the min–max range and the coefficient of variation (stdev ÷ mean).</p>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th scope="col" className="label py-1.5 text-left font-medium">
                Measure
              </th>
              {["Median", "Mean", "Min", "Max", "N"].map((h) => (
                <th key={h} scope="col" className="label py-1.5 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SummaryRow label="Trough → recovery" unit="days" s={r.days} fmt={days} />
            <SummaryRow label="Peak → recovery (underwater)" unit="days" s={r.underwaterDays} fmt={days} />
            <SummaryRow label="Recovery magnitude" unit="gain needed" s={r.gainPct} fmt={pct} />
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-secondary">
        Variability: recovery times ranged from {days(r.days.min)} to {days(r.days.max)} days
        {cv !== null ? `, coefficient of variation ${cv.toFixed(2)}` : ""}. {r.censored ? `${r.censored} episode(s) still below their swing high.` : ""}
      </p>
      {r.days.n > 0 && r.days.n < 5 && <SampleWarning>Only {r.days.n} recovered episode(s) — too few to generalise.</SampleWarning>}
      {bars.length > 0 && (
        <div>
          <div className="label mb-1">Recovery time per episode (days, by swing-high date)</div>
          <BarChart data={bars} x="t" series={[{ key: "days", label: "Recovery (days)" }]} height={200} xFormat={monthYear} yFormat={(v) => formatNumber(v, 0)} />
        </div>
      )}
      <Note>Past recovery times describe what happened; they are not an estimate of how long any current decline will last.</Note>
    </Section>
  );
}
