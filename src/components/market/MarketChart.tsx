"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { DataFreshness, SourceLine } from "@/components/ui/DataFreshness";
import { EmptyState } from "@/components/ui/States";
import { InfoTip, GLOSSARY } from "@/components/ui/Tooltip";
import { PriceChart, type Overlay } from "@/components/charts/PriceChart";
import { tokenColor } from "@/components/charts/theme";
import { useCandles, type Pair } from "@/hooks/useMarketData";
import { atr, bollinger, ema, macd, rsi, sma, vwap } from "@/lib/analytics/indicators";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import type { FreshnessKind } from "@/lib/freshness";
import type { Candle, Timeframe } from "@/lib/types/market";
import { AsyncBlock, Chip, QualityFlags } from "./parts";

const TFS: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"];
const LIMIT: Record<Timeframe, number> = { "1m": 360, "5m": 300, "15m": 300, "1h": 500, "4h": 500, "1D": 730, "1W": 300, "1M": 110 };
const KIND: Record<Timeframe, FreshnessKind> = { "1m": "minute", "5m": "minute", "15m": "minute", "1h": "hourly", "4h": "hourly", "1D": "daily", "1W": "daily", "1M": "daily" };
const INTRADAY = new Set<Timeframe>(["1m", "5m", "15m", "1h", "4h"]);

type Ind = "sma" | "ema" | "bb" | "vwap" | "rsi" | "macd" | "atr" | "vol";
const IND_LABEL: Record<Ind, string> = { sma: "SMA 20/50", ema: "EMA 21", bb: "Bollinger", vwap: "VWAP", rsi: "RSI 14", macd: "MACD", atr: "ATR 14", vol: "Volume" };
const IND_INFO: Record<Ind, string> = {
  sma: "Simple moving averages of close over 20 and 50 periods.",
  ema: "Exponential moving average (21 periods) — weights recent closes more.",
  bb: "Bollinger Bands: 20-period SMA ± 2 standard deviations.",
  vwap: "Volume-weighted average price, reset each UTC day. Intraday timeframes only.",
  rsi: "Relative Strength Index (Wilder, 14). Shown in the lower pane (70/30 guides).",
  macd: "MACD (12, 26, 9): EMA12 − EMA26 and its 9-period signal line, lower pane.",
  atr: GLOSSARY.atr,
  vol: "Traded base volume per candle on the data provider.",
};

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

export function MarketChart({ pair, quote }: { pair: Pair; quote: string }) {
  const [tf, setTf] = useState<Timeframe>("1h");
  const [ind, setInd] = useState<Record<Ind, boolean>>({ sma: false, ema: false, bb: false, vwap: false, rsi: false, macd: false, atr: false, vol: true });
  const [hover, setHover] = useState<Candle | null>(null);
  const mobile = useIsMobile();
  const { data, error, loading, reload, updatedAt } = useCandles(pair, tf, LIMIT[tf]);
  const candles = useMemo(() => data?.candles ?? [], [data]);
  const dp = quote === "BTC" || quote === "ETH" ? 8 : undefined;
  const osc = ind.rsi || ind.macd;

  const toggle = (k: Ind) =>
    setInd((s) => {
      const next = { ...s, [k]: !s[k] };
      // one oscillator at a time — they share the lower pane scale
      if (k === "rsi" && next.rsi) next.macd = false;
      if (k === "macd" && next.macd) next.rsi = false;
      return next;
    });

  const overlays = useMemo<Overlay[]>(() => {
    if (!candles.length) return [];
    const closes = candles.map((c) => c.c);
    const pts = (s: (number | null)[]) => candles.map((c, i) => ({ t: c.t, v: s[i] }));
    const out: Overlay[] = [];
    if (ind.sma) {
      out.push({ id: "sma20", label: "SMA20", points: pts(sma(closes, 20)), color: tokenColor("warning") });
      out.push({ id: "sma50", label: "SMA50", points: pts(sma(closes, 50)), color: tokenColor("info") });
    }
    if (ind.ema) out.push({ id: "ema21", label: "EMA21", points: pts(ema(closes, 21)), color: tokenColor("success") });
    if (ind.bb) {
      const b = bollinger(closes, 20, 2);
      out.push({ id: "bbu", label: "BB up", points: pts(b.upper), dashed: true, color: tokenColor("text-muted") });
      out.push({ id: "bbm", label: "BB mid", points: pts(b.mid), color: tokenColor("text-muted") });
      out.push({ id: "bbl", label: "BB low", points: pts(b.lower), dashed: true, color: tokenColor("text-muted") });
    }
    if (ind.vwap && INTRADAY.has(tf)) out.push({ id: "vwap", label: "VWAP", points: pts(vwap(candles)), color: tokenColor("accent-strong"), width: 2 });
    if (ind.rsi) {
      out.push({ id: "rsi", label: "RSI", points: pts(rsi(closes, 14)), scale: "osc", color: tokenColor("accent") });
      out.push({ id: "rsi70", label: "70", points: candles.map((c) => ({ t: c.t, v: 70 })), scale: "osc", dashed: true, color: tokenColor("text-muted") });
      out.push({ id: "rsi30", label: "30", points: candles.map((c) => ({ t: c.t, v: 30 })), scale: "osc", dashed: true, color: tokenColor("text-muted") });
    }
    if (ind.macd) {
      const m = macd(closes);
      out.push({ id: "macd", label: "MACD", points: pts(m.macd), scale: "osc", color: tokenColor("accent") });
      out.push({ id: "macds", label: "Signal", points: pts(m.signal), scale: "osc", color: tokenColor("warning") });
    }
    return out;
    // `mobile` recreates the chart (height change) — rebuild overlays so they are re-attached
  }, [candles, ind, tf, mobile]);

  const atrNow = useMemo(() => {
    if (!ind.atr || candles.length < 15) return null;
    const a = atr(candles, 14);
    const v = a[a.length - 1];
    return v === null ? null : { v, pct: (v / candles[candles.length - 1].c) * 100 };
  }, [candles, ind.atr]);

  const shown = hover ?? candles[candles.length - 1] ?? null;

  return (
    <Card>
      <CardHeader
        title="Price chart"
        subtitle={data ? data.provenance.source : "Candles from the provider registry"}
        actions={
          <div className="flex items-center gap-2">
            <QualityFlags flags={data?.qualityFlags} />
            <DataFreshness provenance={data?.provenance} timestamp={data?.provenance.fetchedAt} kind={KIND[tf]} />
          </div>
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs ariaLabel="Timeframe" value={tf} onChange={setTf} items={TFS.map((t) => ({ value: t, label: t }))} size={mobile ? "xs" : "sm"} className="w-full sm:w-auto" />
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Indicators">
            {(Object.keys(IND_LABEL) as Ind[]).map((k) => {
              const disabled = (k === "vwap" && !INTRADAY.has(tf)) || (k === "vol" && osc);
              return (
                <Chip
                  key={k}
                  active={ind[k] && !disabled}
                  disabled={disabled}
                  onClick={() => toggle(k)}
                  title={k === "vwap" && disabled ? "VWAP applies to intraday timeframes only" : k === "vol" && disabled ? "Oscillator pane replaces the volume pane" : IND_INFO[k]}
                >
                  {IND_LABEL[k]}
                </Chip>
              );
            })}
          </div>
        </div>
        <div className="num flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-fg-muted" aria-live="off">
          {shown && (
            <>
              <span>{formatDateTime(shown.t, "UTC")}</span>
              <span>
                O <span className="text-fg">{formatPrice(shown.o, quote, dp)}</span>
              </span>
              <span>
                H <span className="text-fg">{formatPrice(shown.h, quote, dp)}</span>
              </span>
              <span>
                L <span className="text-fg">{formatPrice(shown.l, quote, dp)}</span>
              </span>
              <span>
                C <span className={shown.c >= shown.o ? "text-success" : "text-danger"}>{formatPrice(shown.c, quote, dp)}</span>
              </span>
              <span>
                V <span className="text-fg">{formatNumber(shown.v, 0)}</span>
              </span>
            </>
          )}
          {atrNow && (
            <span className="inline-flex items-center gap-1">
              ATR(14) <span className="text-fg">{formatPrice(atrNow.v, quote, dp)}</span> ({atrNow.pct.toFixed(2)}%)
              <InfoTip text={IND_INFO.atr} />
            </span>
          )}
        </div>
        <AsyncBlock loading={loading} error={error} hasData={candles.length > 1} onRetry={reload} lastUpdated={updatedAt} height={mobile ? 320 : 440}>
          {candles.length > 1 ? (
            <PriceChart
              candles={candles}
              height={mobile ? 320 : 440}
              showVolume={ind.vol && !osc}
              overlays={overlays}
              fitKey={`${pair}-${tf}`}
              onCrosshair={setHover}
            />
          ) : (
            <EmptyState title="No candles returned" description="The provider returned no data for this pair and timeframe." />
          )}
        </AsyncBlock>
      </CardBody>
      <CardFooter className="flex-wrap">
        <SourceLine provenance={data?.provenance} />
        <span>
          {data?.provenance.methodology ?? ""} Times UTC. {osc ? "Lower pane: oscillator." : ""}
        </span>
      </CardFooter>
    </Card>
  );
}
