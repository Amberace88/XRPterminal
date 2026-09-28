"use client";

import { useMemo, useState } from "react";
import { PriceChart, type ChartMarker, type PriceLine } from "@/components/charts/PriceChart";
import { tokenColor } from "@/components/charts/theme";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { SourceLine } from "@/components/ui/DataFreshness";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useCandles } from "@/hooks/useMarketData";
import { openOrders } from "@/lib/tradelab/engine";
import type { AccountState } from "@/lib/tradelab/types";
import type { Candle } from "@/lib/types/market";
import { MarketDataLabel, SimTag, px } from "./common";
import { useTradeLab } from "./TradeLabProvider";

type Tf = "1m" | "5m" | "15m" | "1h";
const TF_MS: Record<Tf, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000 };

/** Live candles + last price from the market stream, with simulated position / order levels. */
export function LiveChart({ state, height = 420 }: { state: AccountState | null; height?: number }) {
  const [tf, setTf] = useState<Tf>("15m");
  const q = useCandles("XRP-USD", tf, 300);
  const { snapshot, marketStatus, streaming, venue } = useTradeLab();
  const tfMs = TF_MS[tf];

  const candles = useMemo<Candle[]>(() => {
    const base = q.data?.candles ?? [];
    if (!base.length || !snapshot) return base;
    const last = base[base.length - 1];
    const p = snapshot.price;
    const t = snapshot.quoteT ?? snapshot.t;
    if (t < last.t) return base;
    if (t < last.t + tfMs) return [...base.slice(0, -1), { ...last, c: p, h: Math.max(last.h, p), l: Math.min(last.l, p) }];
    // provisional candle for the live bucket (volume unknown until the provider closes it)
    return [...base, { t: Math.floor(t / tfMs) * tfMs, o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p, v: 0 }];
  }, [q.data, snapshot, tfMs]);

  const priceLines = useMemo<PriceLine[]>(() => {
    if (!state) return [];
    const out: PriceLine[] = [];
    if (state.position) out.push({ price: Number(state.position.avgEntry), label: "Avg entry (sim)", color: tokenColor("accent"), dashed: false });
    for (const o of openOrders(state)) {
      if (o.role === "STOP_LOSS" && o.stopPrice) out.push({ price: Number(o.stopPrice), label: "SL", color: tokenColor("danger") });
      else if (o.role === "TAKE_PROFIT" && o.limitPrice) out.push({ price: Number(o.limitPrice), label: "TP", color: tokenColor("success") });
      else {
        const lvl = o.type === "STOP" || (o.type === "STOP_LIMIT" && o.triggeredAt === null) ? o.stopPrice : o.limitPrice;
        if (lvl) out.push({ price: Number(lvl), label: `${o.side} ${o.type.replace("_", "-")}`, color: tokenColor("text-muted") });
      }
    }
    return out.slice(0, 12);
  }, [state]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!state || !candles.length) return [];
    const first = candles[0].t;
    return state.fills
      .filter((f) => f.t >= first)
      .slice(-80)
      .map((f) => ({
        t: Math.floor(f.t / tfMs) * tfMs,
        position: f.side === "BUY" ? ("belowBar" as const) : ("aboveBar" as const),
        shape: f.side === "BUY" ? ("arrowUp" as const) : ("arrowDown" as const),
        color: f.side === "BUY" ? tokenColor("success") : tokenColor("danger"),
        text: f.side === "BUY" ? "B" : "S",
      }));
  }, [state, candles, tfMs]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            XRP-USD <span className="num text-fg-secondary">{px(snapshot?.price ?? null)}</span>
          </span>
        }
        subtitle={<MarketDataLabel status={marketStatus} streaming={streaming} updatedAt={snapshot?.quoteT ?? null} venue={venue} />}
        actions={
          <div className="flex items-center gap-2">
            <SimTag className="hidden sm:inline-flex" />
            <Tabs value={tf} onChange={setTf} size="xs" ariaLabel="Chart timeframe" items={(Object.keys(TF_MS) as Tf[]).map((k) => ({ value: k, label: k }))} />
          </div>
        }
      />
      <div className="px-2 pb-2 pt-2 sm:px-3">
        {q.loading && !q.data ? (
          <div style={{ height }}>
            <Skeleton className="h-full w-full" />
          </div>
        ) : q.error && !q.data ? (
          <ErrorState compact message={q.error.message} onRetry={q.reload} lastUpdated={q.updatedAt} />
        ) : candles.length ? (
          <PriceChart candles={candles} height={height} priceLines={priceLines} markers={markers} fitKey={tf} />
        ) : (
          <ErrorState compact title="No candles returned" message="The market data provider returned no candles for this timeframe." onRetry={q.reload} />
        )}
      </div>
      <CardFooter>
        <SourceLine provenance={q.data?.provenance} />
        <span className="shrink-0">Markers & levels are simulated orders</span>
      </CardFooter>
    </Card>
  );
}
