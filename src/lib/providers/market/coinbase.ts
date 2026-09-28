import type { Candle, Ticker } from "@/lib/types/market";
import { fetchJson } from "./http";
import { ProviderError, TIMEFRAME_MS, splitPair, type CandleRequest, type MarketDataProvider, type SupportedPair } from "./types";

const BASE = "https://api.exchange.coinbase.com";
const PAIRS: Partial<Record<SupportedPair, string>> = {
  "XRP-USD": "XRP-USD",
  "XRP-EUR": "XRP-EUR",
  "XRP-BTC": "XRP-BTC",
  "BTC-USD": "BTC-USD",
  "ETH-USD": "ETH-USD",
};
// Coinbase granularities (seconds). 4h is aggregated from 1h by the registry.
const GRAN: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1D": 86400 };

interface CbTicker {
  price: string;
  bid: string;
  ask: string;
  volume: string;
  time: string;
}
interface CbStats {
  open: string;
  high: string;
  low: string;
  volume: string;
  last: string;
}

export const coinbase: MarketDataProvider = {
  id: "coinbase",
  name: "Coinbase Exchange",
  pairs: Object.keys(PAIRS) as SupportedPair[],
  historyStart: { "XRP-USD": Date.UTC(2019, 1, 25) },

  async getTicker(pair) {
    const p = PAIRS[pair];
    if (!p) throw new ProviderError("coinbase", `pair ${pair} unsupported`);
    const [t, s] = await Promise.all([
      fetchJson<CbTicker>("coinbase", `${BASE}/products/${p}/ticker`, { revalidate: 10 }),
      fetchJson<CbStats>("coinbase", `${BASE}/products/${p}/stats`, { revalidate: 30 }),
    ]);
    const [base, quote] = splitPair(pair);
    const price = Number(t.price);
    const open = Number(s.open);
    return {
      symbol: base,
      quote: quote as Ticker["quote"],
      price,
      bid: Number(t.bid),
      ask: Number(t.ask),
      open24h: open,
      high24h: Number(s.high),
      low24h: Number(s.low),
      change24h: price - open,
      changePct24h: ((price - open) / open) * 100,
      volume24hBase: Number(s.volume),
      volume24hQuote: Number(s.volume) * price,
      provenance: { source: `Coinbase ${p}`, provider: "coinbase", timestamp: Date.parse(t.time) || Date.now(), fetchedAt: Date.now() },
    };
  },

  async getCandles(req: CandleRequest) {
    const p = PAIRS[req.pair];
    const g = GRAN[req.timeframe];
    if (!p || !g) throw new ProviderError("coinbase", `unsupported ${req.pair} ${req.timeframe}`);
    const tfMs = TIMEFRAME_MS[req.timeframe];
    const end = req.end ?? Date.now();
    const limit = req.limit ?? 300;
    const start = req.start ?? end - limit * tfMs;
    const out: Candle[] = [];
    // Coinbase returns max 300 candles per request.
    let windowEnd = end;
    for (let i = 0; i < 30 && windowEnd > start; i++) {
      const windowStart = Math.max(start, windowEnd - 300 * tfMs);
      const url = `${BASE}/products/${p}/candles?granularity=${g}&start=${new Date(windowStart).toISOString()}&end=${new Date(windowEnd).toISOString()}`;
      const rows = await fetchJson<[number, number, number, number, number, number][]>("coinbase", url, {
        revalidate: req.timeframe === "1D" ? 3600 : 30,
      });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const [time, low, high, open, close, volume] of rows) {
        const t = time * 1000;
        if (t >= start && t < end) out.push({ t, o: open, h: high, l: low, c: close, v: volume });
      }
      windowEnd = windowStart;
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  },
};
