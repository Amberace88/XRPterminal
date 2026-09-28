"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import type { Pair } from "@/hooks/useMarketData";
import { bookMetrics } from "@/lib/analytics/orderbook";
import type { LiveBookInput } from "@/lib/analytics/health";
import { MARKET_PAIRS, MarketHeader } from "./MarketHeader";
import { MarketChart } from "./MarketChart";
import { OrderBook } from "./OrderBook";
import { TradesTape } from "./TradesTape";
import { VolatilityPanel } from "./VolatilityPanel";
import { MarketHealthPanel } from "./MarketHealthPanel";
import { useKrakenBook } from "./useKrakenBook";

export function MarketView() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (MARKET_PAIRS.find((p) => p.value === params.get("pair"))?.value ?? "XRP-USD") as Pair;
  const [pair, setPair] = useState<Pair>(initial);
  const meta = MARKET_PAIRS.find((p) => p.value === pair) ?? MARKET_PAIRS[0];

  useEffect(() => {
    const cur = params.get("pair");
    if ((cur ?? "XRP-USD") !== pair) router.replace(pair === "XRP-USD" ? "/market" : `/market?pair=${pair}`, { scroll: false });
  }, [pair, params, router]);

  const ob = useKrakenBook(meta.kraken, 10);
  const liveBook = useMemo<LiveBookInput | null>(() => {
    if (ob.status !== "live" || !ob.book) return null;
    const m = bookMetrics(ob.book);
    return {
      spreadPct: m.spreadPct,
      depth1Pct: m.depth1PctBid !== null && m.depth1PctAsk !== null ? m.depth1PctBid + m.depth1PctAsk : null,
      quote: meta.quote,
      asOf: ob.lastMsg,
      venue: `Kraken ${meta.kraken}`,
    };
  }, [ob.book, ob.status, ob.lastMsg, meta.quote, meta.kraken]);

  return (
    <>
      <PageHeader
        title="Market"
        description="Live XRP prices, professional charts, order book depth, volatility and market health — every figure shows its source and freshness."
        actions={<Tabs ariaLabel="Trading pair" value={pair} onChange={setPair} items={MARKET_PAIRS.map((p) => ({ value: p.value, label: p.label }))} />}
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <MarketHeader pair={pair} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <MarketChart pair={pair} quote={meta.quote} />
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
          <OrderBook book={ob.book} status={ob.status} error={ob.error} lastMsg={ob.lastMsg} quote={meta.quote} symbol={meta.kraken} onRetry={ob.retry} />
          <TradesTape pairLabel={meta.label} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <VolatilityPanel className="h-full" />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <MarketHealthPanel liveBook={pair === "XRP-USD" ? liveBook : null} className="h-full" />
        </div>
      </div>
      <Disclaimer short className="mt-6" />
    </>
  );
}
