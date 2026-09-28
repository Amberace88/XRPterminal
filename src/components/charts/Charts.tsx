"use client";

import {
  Area,
  AreaChart as RArea,
  Bar,
  BarChart as RBar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart as RLine,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { chartPalette, seriesColor } from "./theme";
import { usePreferences } from "@/components/providers/PreferencesProvider";

/**
 * Reusable Recharts wrappers bound to design tokens (spec §234).
 * Data is an array of plain objects; `x` is the key for the x axis.
 */

type Row = Record<string, number | string | null | undefined>;
export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
  /** secondary axis */
  right?: boolean;
}

function usePalette() {
  const { prefs } = usePreferences();
  const [p, setP] = useState<ReturnType<typeof chartPalette> | null>(null);
  useEffect(() => setP(chartPalette()), [prefs.theme]);
  return p;
}

const axisProps = (p: ReturnType<typeof chartPalette>) => ({
  stroke: p.text,
  tick: { fill: p.text, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: p.grid },
});

function TooltipBox({
  active,
  payload,
  label,
  xFormat,
  yFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  xFormat?: (v: string | number) => string;
  yFormat?: (v: number, key?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-card">
      <div className="mb-1 text-fg-muted">{xFormat && label !== undefined ? xFormat(label) : label}</div>
      {payload.map((pl) => (
        <div key={String(pl.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: pl.color }} />
            {pl.name}
          </span>
          <span className="num font-medium text-fg">
            {typeof pl.value === "number" ? (yFormat ? yFormat(pl.value, String(pl.dataKey)) : pl.value.toLocaleString()) : pl.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({
  data,
  x,
  series,
  height = 260,
  xFormat,
  yFormat,
  refY,
  legend = true,
  area = false,
  logScale = false,
}: {
  data: Row[];
  x: string;
  series: SeriesDef[];
  height?: number;
  xFormat?: (v: string | number) => string;
  yFormat?: (v: number, key?: string) => string;
  refY?: { y: number; label?: string }[];
  legend?: boolean;
  area?: boolean;
  logScale?: boolean;
}) {
  const p = usePalette();
  if (!p) return <div style={{ height }} />;
  const Chart = area ? RArea : RLine;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey={x} {...axisProps(p)} tickFormatter={xFormat} minTickGap={32} />
        <YAxis
          yAxisId="l"
          {...axisProps(p)}
          width={56}
          tickFormatter={(v: number) => (yFormat ? yFormat(v) : String(v))}
          scale={logScale ? "log" : "auto"}
          domain={logScale ? ["auto", "auto"] : undefined}
          allowDataOverflow={logScale}
        />
        {series.some((s) => s.right) && <YAxis yAxisId="r" orientation="right" {...axisProps(p)} width={48} />}
        <Tooltip content={<TooltipBox xFormat={xFormat} yFormat={yFormat} />} />
        {legend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: p.textSecondary }} iconType="circle" iconSize={7} />}
        {refY?.map((r) => (
          <ReferenceLine key={r.y} yAxisId="l" y={r.y} stroke={p.muted} strokeDasharray="4 4" label={r.label ? { value: r.label, fill: p.text, fontSize: 10, position: "insideTopLeft" } : undefined} />
        ))}
        {series.map((s, i) =>
          area ? (
            <Area
              key={s.key}
              yAxisId={s.right ? "r" : "l"}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? seriesColor(i)}
              fill={s.color ?? seriesColor(i, 0.12)}
              fillOpacity={0.5}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              yAxisId={s.right ? "r" : "l"}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={1.6}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

export function BarChart({
  data,
  x,
  series,
  height = 240,
  xFormat,
  yFormat,
  signColors = false,
  stacked = false,
  refY,
}: {
  data: Row[];
  x: string;
  series: SeriesDef[];
  height?: number;
  xFormat?: (v: string | number) => string;
  yFormat?: (v: number, key?: string) => string;
  /** color bars green/red by sign (single series) */
  signColors?: boolean;
  stacked?: boolean;
  refY?: number;
}) {
  const p = usePalette();
  if (!p) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBar data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey={x} {...axisProps(p)} tickFormatter={xFormat} minTickGap={8} />
        <YAxis {...axisProps(p)} width={52} tickFormatter={(v: number) => (yFormat ? yFormat(v) : String(v))} />
        <Tooltip cursor={{ fill: p.grid }} content={<TooltipBox xFormat={xFormat} yFormat={yFormat} />} />
        {refY !== undefined && <ReferenceLine y={refY} stroke={p.muted} />}
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? seriesColor(i)} radius={[3, 3, 0, 0]} stackId={stacked ? "a" : undefined} isAnimationActive={false}>
            {signColors &&
              data.map((row, j) => {
                const v = Number(row[s.key]);
                return <Cell key={j} fill={v >= 0 ? p.up : p.down} fillOpacity={0.85} />;
              })}
          </Bar>
        ))}
      </RBar>
    </ResponsiveContainer>
  );
}

/**
 * Fan chart for scenario ranges: history line + stacked quantile bands.
 * rows: { t, price?, p05?, p25?, p50?, p75?, p95? }
 */
export function FanChart({
  data,
  height = 320,
  xFormat,
  yFormat,
}: {
  data: { t: number; price?: number | null; p05?: number; p25?: number; p50?: number; p75?: number; p95?: number }[];
  height?: number;
  xFormat?: (v: string | number) => string;
  yFormat?: (v: number) => string;
}) {
  const p = usePalette();
  if (!p) return <div style={{ height }} />;
  const rows = data.map((d) => ({
    ...d,
    outer: d.p05 !== undefined && d.p95 !== undefined ? [d.p05, d.p95] : undefined,
    inner: d.p25 !== undefined && d.p75 !== undefined ? [d.p25, d.p75] : undefined,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} {...axisProps(p)} tickFormatter={xFormat} minTickGap={40} />
        <YAxis {...axisProps(p)} width={60} tickFormatter={(v: number) => (yFormat ? yFormat(v) : String(v))} domain={["auto", "auto"]} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as (typeof rows)[number];
            return (
              <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-card">
                <div className="mb-1 text-fg-muted">{xFormat ? xFormat(label as number) : label}</div>
                {r.price != null && <div className="num text-fg">Price: {yFormat ? yFormat(r.price) : r.price}</div>}
                {r.p50 !== undefined && (
                  <>
                    <div className="num text-fg-secondary">P95: {yFormat ? yFormat(r.p95!) : r.p95}</div>
                    <div className="num text-fg-secondary">P75: {yFormat ? yFormat(r.p75!) : r.p75}</div>
                    <div className="num text-fg">Median: {yFormat ? yFormat(r.p50) : r.p50}</div>
                    <div className="num text-fg-secondary">P25: {yFormat ? yFormat(r.p25!) : r.p25}</div>
                    <div className="num text-fg-secondary">P5: {yFormat ? yFormat(r.p05!) : r.p05}</div>
                  </>
                )}
              </div>
            );
          }}
        />
        <Area dataKey="outer" stroke="none" fill={p.accent} fillOpacity={0.1} isAnimationActive={false} connectNulls />
        <Area dataKey="inner" stroke="none" fill={p.accent} fillOpacity={0.22} isAnimationActive={false} connectNulls />
        <Line dataKey="p50" stroke={p.accentStrong} strokeDasharray="5 4" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
        <Line dataKey="price" stroke={p.textSecondary} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
