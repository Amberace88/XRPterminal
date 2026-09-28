"use client";

import { useApi } from "./useApi";
import type { CandleSeries, MarketSnapshot, Ticker, Timeframe } from "@/lib/types/market";

export type Pair = "XRP-USD" | "XRP-EUR" | "XRP-BTC" | "XRP-ETH" | "BTC-USD" | "ETH-USD";

/** Full daily history (from 2017 where the provider has it). Cached 30 min client-side. */
export function useDailyHistory(pair: "XRP-USD" | "XRP-EUR" | "BTC-USD" | "ETH-USD" = "XRP-USD") {
  return useApi<CandleSeries & { attempted: string[] }>(`/api/market/history?pair=${pair}`, { staleMs: 30 * 60_000 });
}

export function useCandles(pair: Pair, tf: Timeframe, limit = 300, refreshMs?: number) {
  const auto = refreshMs ?? ({ "1m": 20_000, "5m": 30_000, "15m": 60_000, "1h": 120_000, "4h": 300_000 } as Record<string, number>)[tf];
  return useApi<CandleSeries & { attempted: string[] }>(`/api/market/candles?pair=${pair}&tf=${tf}&limit=${limit}`, {
    refreshMs: auto,
    staleMs: 15_000,
  });
}

export function useTickerRest(pair: Pair, refreshMs = 30_000) {
  return useApi<{ ticker: Ticker; attempted: string[] }>(`/api/market/ticker?pair=${pair}`, { refreshMs, staleMs: 10_000 });
}

export function useSnapshot(symbol: "XRP" | "BTC" | "ETH" = "XRP") {
  return useApi<MarketSnapshot>(`/api/market/snapshot?symbol=${symbol}`, { refreshMs: 10 * 60_000, staleMs: 5 * 60_000 });
}
