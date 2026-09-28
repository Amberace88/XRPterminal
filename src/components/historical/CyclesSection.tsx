"use client";

import { useMemo, useState } from "react";
import { GitCompare, Waves } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/States";
import { LineChart } from "@/components/charts/Charts";
import { Chip, utcDate } from "@/components/market/parts";
import { CYCLE_PRESETS, detectCycles, normalizeCycle, type Cycle } from "@/lib/analytics/cycles";
import { formatDays, formatNumber, formatPct, formatPrice } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { Note, Section } from "./Section";

export function useCycles(xrp: CandleSeries, presetId: string) {
  return useMemo(() => {
    const preset = CYCLE_PRESETS.find((p) => p.id === presetId) ?? CYCLE_PRESETS[0];
    return { preset, ...detectCycles(xrp.candles, preset.params) };
  }, [xrp, presetId]);
}

const cols: Column<Cycle>[] = [
  {
    key: "label",
    header: "Cycle",
    cell: (c) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-fg">
        {c.label}
        {c.status === "current" && <Badge tone="accent">Current</Badge>}
      </span>
    ),
    value: (c) => c.startT,
  },
  { key: "start", header: "Start (trough)", cell: (c) => <Two a={utcDate(c.startT)} b={formatPrice(c.startPrice, "USD")} />, value: (c) => c.startT },
  { key: "high", header: "Cycle high", cell: (c) => <Two a={utcDate(c.highT)} b={`${formatPrice(c.high, "USD")}${c.status === "current" && !c.peakConfirmed ? " (so far)" : ""}`} />, value: (c) => c.high },
  { key: "ret", header: "Return", align: "right", cell: (c) => <span className="text-success">{formatPct(c.returnPct, 0)}</span>, value: (c) => c.returnPct },
  { key: "dd", header: "Drawdown", align: "right", cell: (c) => <span className="text-danger">{formatPct(c.drawdownPct, 1)}</span>, value: (c) => c.drawdownPct },
  { key: "dur", header: "Duration", align: "right", cell: (c) => formatDays(c.durationDays), value: (c) => c.durationDays },
  { key: "legs", header: "Bull / bear", align: "right", hideBelow: "md", cell: (c) => `${formatNumber(c.bullDays, 0)}d / ${formatNumber(c.bearDays, 0)}d`, value: (c) => c.bullDays },
  {
    key: "rec",
    header: "Recovery",
    align: "right",
    hideBelow: "sm",
    cell: (c) => (c.status === "current" ? "—" : c.recoveryDays !== null ? formatDays(c.recoveryDays) : <span className="text-fg-muted">not regained</span>),
    value: (c) => c.recoveryDays,
  },
  { key: "vol", header: "Volatility", align: "right", hideBelow: "md", cell: (c) => (c.volatility !== null ? `${(c.volatility * 100).toFixed(0)}%` : "—"), value: (c) => c.volatility },
];

function Two({ a, b }: { a: string; b: string }) {
  return (
    <span className="block whitespace-nowrap">
      <span className="text-fg-secondary">{a}</span>
      <span className="num block text-2xs text-fg-muted">{b}</span>
    </span>
  );
}

export function CyclesSection({ xrp, presetId, onPreset }: { xrp: CandleSeries; presetId: string; onPreset: (id: string) => void }) {
  const { cycles, preset } = useCycles(xrp, presetId);
  return (
    <Section
      id="cycles"
      title="Historical cycles"
      icon={<Waves className="h-4 w-4" />}
      subtitle={`${cycles.filter((c) => c.status === "complete").length} complete cycle(s) identified with the ${preset.label} rule`}
      provenance={xrp.provenance}
      actions={
        <label className="flex items-center gap-2 text-2xs text-fg-muted">
          <span className="hidden sm:inline">Rule</span>
          <select className="select h-8 text-xs" value={presetId} onChange={(e) => onPreset(e.target.value)} aria-label="Cycle detection rule">
            {CYCLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      }
      methodology={
        <>
          <p>
            Major turning points are found with an asymmetric zig-zag on daily closes: a peak is confirmed once price has fallen at least {preset.params.declinePct}% from it, and a trough once price has risen at least{" "}
            {preset.params.rallyPct}% from it. A cycle runs trough → peak → next trough.
          </p>
          <p>
            Return = peak ÷ starting trough − 1. Drawdown = ending trough ÷ peak − 1 (for the current cycle: latest close ÷ cycle high − 1). Duration = trough to trough. Recovery = days from the ending trough until a close regains
            the cycle high. Volatility = annualized standard deviation of daily log returns inside the cycle (√365).
          </p>
          <p>The first cycle begins at the first confirmed trough in the dataset, so any earlier history is excluded. Cycle labels are applied after the fact and do not imply that future cycles must repeat.</p>
        </>
      }
      footer={<span>Descriptive only — cycles do not repeat on schedule</span>}
    >
      {cycles.length ? (
        <DataTable rows={cycles} columns={cols} rowKey={(c) => c.id} csvName="xrp-cycles" pageSize={12} />
      ) : (
        <EmptyState title="No cycles detected" description="The dataset has no swing large enough for this rule. Try a more sensitive rule." />
      )}
    </Section>
  );
}

type Metric = "index" | "dd" | "vol";
type Anchor = "trough" | "peak";
type Win = "current" | "365" | "730" | "full";

export function CycleComparisonSection({ xrp, presetId }: { xrp: CandleSeries; presetId: string }) {
  const { cycles } = useCycles(xrp, presetId);
  const [metric, setMetric] = useState<Metric>("index");
  const [anchor, setAnchor] = useState<Anchor>("trough");
  const [win, setWin] = useState<Win>("current");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = cycles.filter((c) => !hidden.has(c.id)).slice(-6);

  const { rows, maxDay } = useMemo(() => {
    const current = cycles.find((c) => c.status === "current");
    const curLen = current ? Math.round((current.endT - (anchor === "trough" ? current.startT : current.highT)) / 86_400_000) : 365;
    const maxDay = win === "current" ? Math.max(90, curLen) : win === "365" ? 365 : win === "730" ? 730 : 5000;
    const series = visible.map((c) => ({ c, pts: normalizeCycle(xrp.candles, c, anchor, anchor === "peak" ? maxDay : 0, maxDay) }));
    const longest = Math.min(maxDay, Math.max(0, ...series.map((s) => s.pts[s.pts.length - 1]?.day ?? 0)));
    const step = Math.max(1, Math.ceil(longest / 500));
    const byDay = new Map<number, Record<string, number | null>>();
    for (const s of series) {
      for (const p of s.pts) {
        const d = Math.floor(p.day / step) * step;
        if (d > longest) continue;
        const row = byDay.get(d) ?? { day: d };
        const v = metric === "index" ? p.index : metric === "dd" ? p.dd : p.vol30 !== null ? p.vol30 * 100 : null;
        if (row[s.c.id] === undefined || p.day % step === 0) row[s.c.id] = v;
        byDay.set(d, row);
      }
    }
    return { rows: [...byDay.values()].sort((a, b) => (a.day as number) - (b.day as number)), maxDay: longest };
  }, [cycles, visible, anchor, metric, win, xrp]);

  const yFormat = (v: number) => (metric === "index" ? formatNumber(v, 0) : `${v.toFixed(0)}%`);

  return (
    <Section
      id="cycle-comparison"
      title="Normalized cycle comparison"
      icon={<GitCompare className="h-4 w-4" />}
      subtitle={`Days since cycle ${anchor === "trough" ? "start (trough)" : "peak"} · ${metric === "index" ? "price indexed to 100" : metric === "dd" ? "drawdown from running high" : "rolling 30D volatility"}`}
      provenance={xrp.provenance}
      methodology={
        <>
          <p>
            Each cycle is re-based so day 0 is its starting trough (or its peak). Indexed price = close ÷ anchor close × 100. Drawdown = close ÷ highest close since the anchor − 1. Volatility = annualized 30-day realized
            volatility on that day.
          </p>
          <p>
            From the trough, each line ends at that cycle&apos;s next trough. From the peak, lines continue after the next trough (up to the chosen window) so recoveries can be compared. The current cycle is shown up to the
            latest close. Lines are sampled every {Math.max(1, Math.ceil(maxDay / 500))} day(s) for display.
          </p>
          <p>Overlaying past cycles is a descriptive comparison; the current cycle is not expected to follow any previous path.</p>
        </>
      }
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <Tabs
          ariaLabel="Metric"
          value={metric}
          onChange={setMetric}
          items={[
            { value: "index", label: "Indexed price" },
            { value: "dd", label: "Drawdown" },
            { value: "vol", label: "Volatility" },
          ]}
        />
        <Tabs
          ariaLabel="Anchor"
          value={anchor}
          onChange={setAnchor}
          items={[
            { value: "trough", label: "From trough" },
            { value: "peak", label: "From peak" },
          ]}
        />
        <Tabs
          ariaLabel="Window"
          value={win}
          onChange={setWin}
          items={[
            { value: "current", label: "Current length" },
            { value: "365", label: "1Y" },
            { value: "730", label: "2Y" },
            { value: "full", label: "Full" },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Cycles shown">
        {cycles.map((c) => (
          <Chip
            key={c.id}
            active={!hidden.has(c.id)}
            onClick={() =>
              setHidden((h) => {
                const n = new Set(h);
                if (n.has(c.id)) n.delete(c.id);
                else n.add(c.id);
                return n;
              })
            }
          >
            {c.label}
          </Chip>
        ))}
      </div>
      {visible.length && rows.length > 1 ? (
        <LineChart
          data={rows}
          x="day"
          series={visible.map((c) => ({ key: c.id, label: c.label }))}
          height={320}
          logScale={metric === "index"}
          xFormat={(v) => `d${v}`}
          yFormat={yFormat}
          refY={metric === "index" ? [{ y: 100, label: "Anchor = 100" }] : metric === "dd" ? [{ y: 0 }] : undefined}
        />
      ) : (
        <EmptyState title="Select at least one cycle" description="Toggle cycles above to compare their normalized paths." />
      )}
      <Note>Showing up to 6 cycles. Indexed price uses a log scale so very large and small moves remain comparable.</Note>
    </Section>
  );
}
