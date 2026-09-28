import type { Candle, Ticker } from "@/lib/types/market";
import { fetchJson } from "./http";
import { ProviderError, TIMEFRAME_MS, splitPair, type CandleRequest, type MarketDataProvider, type SupportedPair } from "./types";

const BASE = "https://www.bitstamp.net/api/v2";
const PAIRS: Partial<Record<SupportedPair, string>> = {
  "XRP-USD": "xrpusd",
  "XRP-EUR": "xrpeur",
  "XRP-BTC": "xrpbtc",
  "BTC-USD": "btcusd",
  "ETH-USD": "ethusd",
};
const STEP: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1D": 86400 };

interface BsOhlc {
  data: { pair: string; ohlc: { timestamp: string; open: string; high: string; low: string; close: string; volume: string }[] };
}
interface BsTicker {
  last: string;
  high: string;
  low: string;
  volume: string;
  bid: string;
  ask: string;
  open: string;
  open_24?: string;
  percent_change_24?: string;
  timestamp: string;
}

/** Bitstamp — longest continuous regulated-exchange XRP/USD daily history (since Jan 2017). */
export const bitstamp: MarketDataProvider = {
  id: "bitstamp",
  name: "Bitstamp",
  pairs: Object.keys(PAIRS) as SupportedPair[],
  historyStart: { "XRP-USD": Date.UTC(2017, 0, 1) },

  async getTicker(pair) {
    const p = PAIRS[pair];
    if (!p) throw new ProviderError("bitstamp", `pair ${pair} unsupported`);
    const t = await fetchJson<BsTicker>("bitstamp", `${BASE}/ticker/${p}/`, { revalidate: 15 });
    const [base, quote] = splitPair(pair);
    const price = Number(t.last);
    const open = Number(t.open_24 ?? t.open);
    return {
      symbol: base,
      quote: quote as Ticker["quote"],
      price,
      bid: Number(t.bid),
      ask: Number(t.ask),
      open24h: open,
      high24h: Number(t.high),
      low24h: Number(t.low),
      change24h: price - open,
      changePct24h: t.percent_change_24 !== undefined ? Number(t.percent_change_24) : ((price - open) / open) * 100,
      volume24hBase: Number(t.volume),
      volume24hQuote: Number(t.volume) * price,
      provenance: { source: `Bitstamp ${p.toUpperCase()}`, provider: "bitstamp", timestamp: Number(t.timestamp) * 1000, fetchedAt: Date.now() },
    };
  },

  async getCandles(req: CandleRequest) {
    const p = PAIRS[req.pair];
    const step = STEP[req.timeframe];
    if (!p || !step) throw new ProviderError("bitstamp", `unsupported ${req.pair} ${req.timeframe}`);
    const tfMs = TIMEFRAME_MS[req.timeframe];
    const end = req.end ?? Date.now();
    const limit = req.limit ?? 500;
    const start = req.start ?? end - limit * tfMs;
    const out: Candle[] = [];
    let cursor = Math.floor(start / 1000);
    const endS = Math.floor(end / 1000);
    // Paginate by time window: Bitstamp returns the candles inside [start, start + 1000·step),
    // so a window can hold fewer than 1000 rows (e.g. before a pair was listed). Always advance
    // the cursor by the full window instead of stopping on a short page.
    for (let i = 0; i < 30 && cursor < endS; i++) {
      const url = `${BASE}/ohlc/${p}/?step=${step}&limit=1000&start=${cursor}`;
      const res = await fetchJson<BsOhlc>("bitstamp", url, { revalidate: req.timeframe === "1D" ? 3600 : 60, timeoutMs: 12000 });
      const rows = res?.data?.ohlc ?? [];
      for (const r of rows) {
        const t = Number(r.timestamp) * 1000;
        if (t < start || t >= end) continue;
        out.push({ t, o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close), v: Number(r.volume) });
      }
      const last = rows.length ? Number(rows[rows.length - 1].timestamp) : cursor;
      cursor = Math.max(last + step, cursor + 1000 * step);
    }
    return out;
  },
};
