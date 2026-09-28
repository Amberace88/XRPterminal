"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { BarChart } from "@/components/charts/Charts";
import { MONTH_NAMES, monthlyReturns, monthStats, SEASONALITY_MIN_N, seasonalityCoverage, weekdayStats, yearlyReturns, type BucketStats } from "@/lib/analytics/seasonality";
import { formatPct } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";
import { Note, SampleWarning, Section } from "./Section";

function heat(v: number | null | undefined): React.CSSProperties | undefined {
  if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
  const a = Math.min(0.55, 0.08 + (Math.min(Math.abs(v), 60) / 60) * 0.47);
  return { background: v >= 0 ? `rgb(var(--success) / ${a.toFixed(3)})` : `rgb(var(--danger) / ${a.toFixed(3)})` };
}

export function SeasonalitySection({ xrp }: { xrp: CandleSeries }) {
  const { months, stats, years, weekdays, coverage } = useMemo(() => {
    const months = monthlyReturns(xrp.candles);
    return { months, stats: monthStats(months), years: yearlyReturns(xrp.candles), weekdays: weekdayStats(xrp.candles), coverage: seasonalityCoverage(months) };
  }, [xrp]);
  const yearList = useMemo(() => [...new Set(months.map((m) => m.year))].sort((a, b) => b - a), [months]);
  const cell = (y: number, m: number) => months.find((r) => r.year === y && r.month === m);
  const small = stats.filter((s) => s.smallSample);
  const period = coverage.from && coverage.to ? `${MONTH_NAMES[coverage.from.month]} ${coverage.from.year} – ${MONTH_NAMES[coverage.to.month]} ${coverage.to.year}` : "—";

  return (
    <Section
      id="seasonality"
      title="Seasonality"
      icon={<Calendar className="h-4 w-4" />}
      subtitle={`Monthly & weekday patterns · ${coverage.completeMonths} complete months (${period})`}
      provenance={xrp.provenance}
      methodology={
        <>
          <p>
            Monthly return = last close of the month ÷ last close of the previous month − 1 (UTC calendar months). Only complete months enter the statistics: the current month (shown as month-to-date with a dashed outline) and
            months with fewer than 25 daily closes are excluded.
          </p>
          <p>
            Per-month statistics: mean, median, share of positive months and sample size N (number of years observed). Buckets with N &lt; {SEASONALITY_MIN_N} are marked as small samples — with so few observations a single year
            dominates the average and no seasonal conclusion should be drawn.
          </p>
          <p>Weekday returns use consecutive UTC days only (close ÷ previous close − 1). Crypto trades 24/7, so weekday effects are small relative to daily noise.</p>
        </>
      }
      footer={<span>Seasonal averages are not forecasts</span>}
    >
      {small.length > 0 && (
        <SampleWarning>
          Small samples: {small.map((s) => `${s.label} (N=${s.n})`).join(", ")}. Treat these averages as anecdotal — each month has at most {Math.max(...stats.map((s) => s.n))} observations in this dataset.
        </SampleWarning>
      )}
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="num w-full min-w-[760px] border-collapse text-2xs">
          <caption className="sr-only">Monthly returns by year (percent)</caption>
          <thead>
            <tr className="bg-bg-secondary/60">
              <th scope="col" className="label sticky left-0 bg-bg-secondary px-2 py-1.5 text-left font-medium">
                Year
              </th>
              {MONTH_NAMES.map((m) => (
                <th key={m} scope="col" className="label px-1 py-1.5 text-center font-medium">
                  {m}
                </th>
              ))}
              <th scope="col" className="label px-2 py-1.5 text-right font-medium">
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {yearList.map((y) => {
              const yr = years.find((r) => r.year === y);
              return (
                <tr key={y} className="border-t border-border-subtle/60">
                  <th scope="row" className="sticky left-0 bg-surface px-2 py-1 text-left font-medium text-fg-secondary">
                    {y}
                  </th>
                  {MONTH_NAMES.map((_, m) => {
                    const c = cell(y, m);
                    return (
                      <td key={m} className="p-0.5 text-center">
                        {c ? (
                          <span
                            className={cn("block rounded px-1 py-1 text-fg", !c.complete && "border border-dashed border-border italic text-fg-secondary")}
                            style={heat(c.returnPct)}
                            title={`${MONTH_NAMES[m]} ${y}: ${formatPct(c.returnPct, 1)}${c.complete ? "" : " (partial month — excluded from stats)"}`}
                          >
                            {formatPct(c.returnPct, 0)}
                          </span>
                        ) : (
                          <span className="block py-1 text-fg-muted/50">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right">
                    {yr ? (
                      <span className={cn(yr.returnPct >= 0 ? "text-success" : "text-danger", !yr.complete && "italic")} title={yr.complete ? undefined : "Year to date / partial year"}>
                        {formatPct(yr.returnPct, 0)}
                        {!yr.complete && "*"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border">
            <StatRow label="Mean" stats={stats} pick={(s) => s.mean} heatmap />
            <StatRow label="Median" stats={stats} pick={(s) => s.median} heatmap />
            <StatRow label="% positive" stats={stats} pick={(s) => s.positiveRate} fmt={(v) => `${v.toFixed(0)}%`} />
            <StatRow label="N (years)" stats={stats} pick={(s) => s.n} fmt={(v) => String(v)} plain />
          </tfoot>
        </table>
      </div>
      <Note>* partial year. Dashed cells: current month-to-date, excluded from statistics. Cells in muted italics in the summary rows have N &lt; {SEASONALITY_MIN_N}.</Note>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="label mb-1">Mean daily return by weekday (UTC)</div>
          <BarChart
            data={weekdays.map((w) => ({ day: w.label, mean: w.mean !== null ? Number(w.mean.toFixed(3)) : null }))}
            x="day"
            series={[{ key: "mean", label: "Mean daily return (%)" }]}
            signColors
            height={200}
            yFormat={(v) => `${v.toFixed(2)}%`}
            refY={0}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Day", "Mean", "Median", "% up", "N"].map((h, i) => (
                  <th key={h} scope="col" className={cn("label py-1.5 font-medium", i ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekdays.map((w) => (
                <tr key={w.key} className="border-b border-border-subtle/50 last:border-0">
                  <th scope="row" className="py-1.5 text-left font-medium text-fg-secondary">
                    {w.label}
                  </th>
                  <td className="py-1.5 text-right">{formatPct(w.mean, 2)}</td>
                  <td className="py-1.5 text-right">{formatPct(w.median, 2)}</td>
                  <td className="py-1.5 text-right">{w.positiveRate !== null ? `${w.positiveRate.toFixed(0)}%` : "—"}</td>
                  <td className="py-1.5 text-right text-fg-muted">{w.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note className="mt-2">Differences between weekdays are typically far smaller than the day-to-day dispersion of returns.</Note>
        </div>
      </div>
    </Section>
  );
}

function StatRow({
  label,
  stats,
  pick,
  fmt = (v) => formatPct(v, 1),
  heatmap,
  plain,
}: {
  label: string;
  stats: BucketStats[];
  pick: (s: BucketStats) => number | null;
  fmt?: (v: number) => string;
  heatmap?: boolean;
  plain?: boolean;
}) {
  return (
    <tr className="border-t border-border-subtle/60">
      <th scope="row" className="sticky left-0 bg-surface px-2 py-1 text-left font-medium text-fg-secondary">
        {label}
      </th>
      {stats.map((s) => {
        const v = pick(s);
        return (
          <td key={s.key} className="p-0.5 text-center">
            <Tooltip content={`${s.label}: N=${s.n}${s.smallSample ? " — small sample" : ""}`}>
              <span
                tabIndex={0}
                className={cn("block rounded px-1 py-1", plain ? "text-fg-muted" : "text-fg", s.smallSample && !plain && "italic text-fg-muted")}
                style={heatmap && !s.smallSample ? heat(v) : undefined}
              >
                {v === null ? "—" : fmt(v)}
              </span>
            </Tooltip>
          </td>
        );
      })}
      <td />
    </tr>
  );
}
