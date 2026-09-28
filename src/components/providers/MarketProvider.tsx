"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { startTickerStream, type StreamTrade } from "@/lib/providers/market/stream";
import { apiGet } from "@/hooks/useApi";
import type { DataStatus, Fiat, FxRates, Ticker } from "@/lib/types/market";
import { freshnessStatus } from "@/lib/freshness";
import { usePreferences } from "./PreferencesProvider";

/**
 * Global real-time XRP market state (spec §318: real-time state kept separate).
 * Source order: exchange WebSocket → REST polling fallback via /api/market/ticker.
 * Status honestly reports LIVE (stream) / RECENT (polled) / STALE / UNAVAILABLE.
 */
interface MarketCtx {
  ticker: Ticker | null;
  status: DataStatus;
  venue: string | null;
  streaming: boolean;
  trades: StreamTrade[];
  fx: FxRates | null;
  /** Convert a USD amount into the user's display currency. */
  toDisplay: (usd: number | null | undefined) => number | null;
  currency: Fiat;
  priceHistory: { t: number; p: number }[];
}

const Ctx = createContext<MarketCtx | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = usePreferences();
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [venue, setVenue] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [trades, setTrades] = useState<StreamTrade[]>([]);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [now, setNow] = useState(Date.now());
  const [priceHistory, setPriceHistory] = useState<{ t: number; p: number }[]>([]);
  const lastPush = useRef(0);
  const streamingRef = useRef(false);

  // WebSocket stream
  useEffect(() => {
    const stop = startTickerStream({
      onTicker: (t) => {
        setTicker(t);
        const nowMs = Date.now();
        if (nowMs - lastPush.current > 2000) {
          lastPush.current = nowMs;
          setPriceHistory((h) => [...h.slice(-599), { t: nowMs, p: t.price }]);
        }
      },
      onTrade: (tr) => setTrades((prev) => [tr, ...prev].slice(0, 60)),
      onStatus: (s) => {
        setVenue(s.venue);
        const live = s.state === "live";
        streamingRef.current = live;
        setStreaming(live);
      },
    });
    return stop;
  }, []);

  // REST fallback polling when no stream is live
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (streamingRef.current) return;
      try {
        const d = await apiGet<{ ticker: Ticker }>("/api/market/ticker?pair=XRP-USD");
        if (!cancelled && !streamingRef.current) {
          setTicker(d.ticker);
          setVenue(d.ticker.provenance.provider);
        }
      } catch {
        /* keep last known value; status turns STALE */
      }
    };
    const first = setTimeout(poll, 4000);
    const id = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // FX (ECB)
  useEffect(() => {
    apiGet<FxRates>("/api/market/fx")
      .then(setFx)
      .catch(() => setFx(null));
  }, []);

  // clock for freshness
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<MarketCtx>(() => {
    const status = ticker ? freshnessStatus(ticker.provenance.fetchedAt, "realtime", now, streaming) : "UNAVAILABLE";
    const currency = prefs.currency;
    const rate = currency === "USD" ? 1 : fx?.rates[currency];
    return {
      ticker,
      status,
      venue,
      streaming,
      trades,
      fx,
      currency: rate ? currency : "USD",
      toDisplay: (usd) => (usd === null || usd === undefined || !Number.isFinite(usd) ? null : usd * (rate ?? 1)),
      priceHistory,
    };
  }, [ticker, now, streaming, venue, trades, fx, prefs.currency, priceHistory]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarket(): MarketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMarket must be used inside MarketProvider");
  return c;
}
