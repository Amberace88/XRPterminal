"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/types/market";
import { chartPalette, seriesColor } from "./theme";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export interface Overlay {
  id: string;
  label: string;
  points: { t: number; v: number | null }[];
  color?: string;
  /** separate pane-like scale at the bottom (e.g. RSI) */
  scale?: "right" | "osc";
  dashed?: boolean;
  width?: 1 | 2 | 3;
}

export interface PriceLine {
  price: number;
  label: string;
  color?: string;
  dashed?: boolean;
}

export interface ChartMarker {
  t: number;
  position: "aboveBar" | "belowBar" | "inBar";
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  color?: string;
  text?: string;
}

/**
 * Professional price chart built on TradingView Lightweight Charts™ (Apache-2.0).
 * Handles candles/line/area, volume histogram, indicator overlays, price lines and markers.
 * Times are rendered in UTC-based chart time; the axis label states "UTC".
 */
export function PriceChart({
  candles,
  type = "candles",
  height = 420,
  showVolume = true,
  overlays = [],
  priceLines = [],
  markers = [],
  fitKey,
  lineColor,
  className,
  onCrosshair,
}: {
  candles: Candle[];
  type?: "candles" | "line" | "area";
  height?: number;
  showVolume?: boolean;
  overlays?: Overlay[];
  priceLines?: PriceLine[];
  markers?: ChartMarker[];
  /** change this to re-fit the visible range (e.g. timeframe change) */
  fitKey?: string;
  lineColor?: string;
  className?: string;
  onCrosshair?: (c: Candle | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeries = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const lines = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const lastFit = useRef<string | undefined>(undefined);
  const byTime = useRef<Map<number, Candle>>(new Map());
  const { prefs } = usePreferences();

  // create chart
  useEffect(() => {
    if (!el.current) return;
    const p = chartPalette();
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: p.text, fontSize: 11, fontFamily: "var(--font-geist-mono), monospace" },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.grid, scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.06 } },
      timeScale: { borderColor: p.grid, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: p.muted, labelBackgroundColor: p.accent }, horzLine: { color: p.muted, labelBackgroundColor: p.accent } },
      localization: { priceFormatter: (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(4) : v.toPrecision(4)) },
    });
    chart.current = c;
    if (type === "candles") {
      main.current = c.addCandlestickSeries({
        upColor: p.up,
        downColor: p.down,
        borderUpColor: p.up,
        borderDownColor: p.down,
        wickUpColor: p.up,
        wickDownColor: p.down,
      });
    } else if (type === "area") {
      main.current = c.addAreaSeries({ lineColor: lineColor ?? p.accent, topColor: p.accentSoft, bottomColor: "rgba(0,0,0,0)", lineWidth: 2 });
    } else {
      main.current = c.addLineSeries({ color: lineColor ?? p.accent, lineWidth: 2 });
    }
    if (showVolume) {
      vol.current = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
    c.subscribeCrosshairMove((param) => {
      if (!onCrosshair) return;
      if (!param.time) return onCrosshair(null);
      onCrosshair(byTime.current.get(Number(param.time) * 1000) ?? null);
    });
    const series = overlaySeries.current;
    return () => {
      series.clear();
      lines.current = [];
      c.remove();
      chart.current = null;
      main.current = null;
      vol.current = null;
      lastFit.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, showVolume, height, prefs.theme]);

  // data
  useEffect(() => {
    const c = chart.current;
    const s = main.current;
    if (!c || !s) return;
    const p = chartPalette();
    byTime.current = new Map(candles.map((k) => [k.t, k]));
    const t = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
    if (type === "candles") {
      (s as ISeriesApi<"Candlestick">).setData(candles.map((k) => ({ time: t(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
    } else {
      (s as ISeriesApi<"Line">).setData(candles.map((k) => ({ time: t(k.t), value: k.c })));
    }
    if (vol.current) {
      vol.current.setData(
        candles.map((k) => ({ time: t(k.t), value: k.v, color: k.c >= k.o ? p.up.replace(",1)", ",0.35)") : p.down.replace(",1)", ",0.35)") })),
      );
    }
    s.setMarkers(
      [...markers]
        .sort((a, b) => a.t - b.t)
        .map((m) => ({ time: t(m.t) as Time, position: m.position, shape: m.shape, color: m.color ?? p.accent, text: m.text })) as SeriesMarker<Time>[],
    );
    if (fitKey !== lastFit.current) {
      c.timeScale().fitContent();
      lastFit.current = fitKey;
    }
  }, [candles, markers, type, fitKey]);

  // overlays
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const existing = overlaySeries.current;
    const keep = new Set(overlays.map((o) => o.id));
    for (const [id, s] of existing) {
      if (!keep.has(id)) {
        c.removeSeries(s);
        existing.delete(id);
      }
    }
    let oscUsed = false;
    overlays.forEach((o, i) => {
      let s = existing.get(o.id);
      if (!s) {
        s = c.addLineSeries({
          color: o.color ?? seriesColor(i + 1),
          lineWidth: o.width ?? 1,
          lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: o.scale === "osc" ? "osc" : "right",
          title: o.label,
        });
        existing.set(o.id, s);
      }
      if (o.scale === "osc") oscUsed = true;
      s.setData(o.points.filter((p) => p.v !== null && Number.isFinite(p.v)).map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.v as number })));
    });
    if (oscUsed) c.priceScale("osc").applyOptions({ scaleMargins: { top: 0.75, bottom: 0.02 } });
  }, [overlays]);

  // price lines
  useEffect(() => {
    const s = main.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    const p = chartPalette();
    lines.current = priceLines.map((pl) =>
      s.createPriceLine({
        price: pl.price,
        color: pl.color ?? p.accent,
        lineWidth: 1,
        lineStyle: pl.dashed === false ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: pl.label,
      }),
    );
  }, [priceLines]);

  return <div ref={el} className={className} style={{ height, width: "100%" }} aria-label="Price chart" role="img" />;
}
