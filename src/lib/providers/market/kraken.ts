import type { Candle, Ticker } from "@/lib/types/market";
import { fetchJson } from "./http";
import { ProviderError, splitPair, type CandleRequest, type MarketDataProvider, type SupportedPair } from "./types";

const BASE = "https://api.kraken.com/0/public";
const PAIRS: Partial<Record<SupportedPair, string>> = {
  "XRP-USD": "XRPUSD",
  "XRP-EUR": "XRPEUR",
  "XRP-BTC": "XRPXBT",
  "XRP-ETH": "XRPETH",
  "BTC-USD": "XBTUSD",
  "ETH-USD": "ETHUSD",
};
const INTERVAL: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1D": 1440 };

interface KrResp<T> {
  error: string[];
  result: T;
}
type KrTicker = Record<string, { a: string[]; b: string[]; c: string[]; v: string[]; h: string[]; l: string[]; o: string }>;

export const kraken: MarketDataProvider = {
  id: "kraken",
  name: "Kraken",
  pairs: Object.keys(PAIRS) as SupportedPair[],

  async getTicker(pair) {
    const p = PAIRS[pair];
    if (!p) throw new ProviderError("kraken", `pair ${pair} unsupported`);
    const res = await fetchJson<KrResp<KrTicker>>("kraken", `${BASE}/Ticker?pair=${p}`, { revalidate: 15 });
    if (res.error?.length) throw new ProviderError("kraken", res.error.join(", "));
    const t = Object.values(res.result)[0];
    const [base, quote] = splitPair(pair);
    const price = Number(t.c[0]);
    const open = Number(t.o);
    return {
      symbol: base,
      quote: quote as Ticker["quote"],
      price,
      bid: Number(t.b[0]),
      ask: Number(t.a[0]),
      open24h: open,
      high24h: Number(t.h[1]),
      low24h: Number(t.l[1]),
      change24h: price - open,
      changePct24h: ((price - open) / open) * 100,
      volume24hBase: Number(t.v[1]),
      volume24hQuote: Number(t.v[1]) * price,
      // Kraken ticker has no exchange timestamp; fetchedAt is the best available time.
      provenance: { source: `Kraken ${p}`, provider: "kraken", timestamp: Date.now(), fetchedAt: Date.now(), methodology: "Open = today's opening price (UTC)" },
    };
  },

  async getCandles(req: CandleRequest) {
    const p = PAIRS[req.pair];
    const interval = INTERVAL[req.timeframe];
    if (!p || !interval) throw new ProviderError("kraken", `unsupported ${req.pair} ${req.timeframe}`);
    // Kraken returns at most the latest 720 candles.
    const since = req.start ? Math.floor(req.start / 1000) : undefined;
    const url = `${BASE}/OHLC?pair=${p}&interval=${interval}${since ? `&since=${since}` : ""}`;
    const res = await fetchJson<KrResp<Record<string, unknown>>>("kraken", url, { revalidate: req.timeframe === "1D" ? 3600 : 30 });
    if (res.error?.length) throw new ProviderError("kraken", res.error.join(", "));
    const key = Object.keys(res.result).find((k) => k !== "last");
    const rows = (key ? (res.result[key] as (string | number)[][]) : []) ?? [];
    const end = req.end ?? Number.POSITIVE_INFINITY;
    return rows
      .map((r) => ({ t: Number(r[0]) * 1000, o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[6]) }))
      .filter((c) => (!req.start || c.t >= req.start) && c.t < end);
  },
};
