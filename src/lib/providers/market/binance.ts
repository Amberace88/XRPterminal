import type { Candle, Ticker } from "@/lib/types/market";
import { fetchJson } from "./http";
import { ProviderError, type CandleRequest, type MarketDataProvider, type SupportedPair } from "./types";

// data-api.binance.vision is Binance's public market-data-only endpoint.
const BASES = ["https://data-api.binance.vision/api/v3", "https://api.binance.com/api/v3"];
// NOTE: USD pairs are served as USDT — labelled explicitly in provenance.
const PAIRS: Partial<Record<SupportedPair, string>> = {
  "XRP-USD": "XRPUSDT",
  "XRP-EUR": "XRPEUR",
  "XRP-BTC": "XRPBTC",
  "XRP-ETH": "XRPETH",
  "BTC-USD": "BTCUSDT",
  "ETH-USD": "ETHUSDT",
};
const INTERVAL: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d" };

interface BnTicker {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  openPrice: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  closeTime: number;
}

async function get<T>(path: string, revalidate: number): Promise<T> {
  let last: unknown;
  for (const b of BASES) {
    try {
      return await fetchJson<T>("binance", `${b}${path}`, { revalidate, retries: 0 });
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new ProviderError("binance", "unavailable");
}

export const binance: MarketDataProvider = {
  id: "binance",
  name: "Binance",
  pairs: Object.keys(PAIRS) as SupportedPair[],
  historyStart: { "XRP-USD": Date.UTC(2018, 4, 4) },

  async getTicker(pair) {
    const p = PAIRS[pair];
    if (!p) throw new ProviderError("binance", `pair ${pair} unsupported`);
    const t = await get<BnTicker>(`/ticker/24hr?symbol=${p}`, 10);
    const [base, quote] = pair.split("-");
    return {
      symbol: base,
      quote: quote as Ticker["quote"],
      price: Number(t.lastPrice),
      bid: Number(t.bidPrice),
      ask: Number(t.askPrice),
      open24h: Number(t.openPrice),
      high24h: Number(t.highPrice),
      low24h: Number(t.lowPrice),
      change24h: Number(t.priceChange),
      changePct24h: Number(t.priceChangePercent),
      volume24hBase: Number(t.volume),
      volume24hQuote: Number(t.quoteVolume),
      provenance: {
        source: `Binance ${p}${p.endsWith("USDT") ? " (USDT used as USD proxy)" : ""}`,
        provider: "binance",
        timestamp: t.closeTime,
        fetchedAt: Date.now(),
      },
    };
  },

  async getCandles(req: CandleRequest) {
    const p = PAIRS[req.pair];
    const interval = INTERVAL[req.timeframe];
    if (!p || !interval) throw new ProviderError("binance", `unsupported ${req.pair} ${req.timeframe}`);
    const out: Candle[] = [];
    const end = req.end ?? Date.now();
    let cursor = req.start ?? 0;
    const limit = req.limit ?? 500;
    if (!req.start) {
      const rows = await get<(string | number)[][]>(`/klines?symbol=${p}&interval=${interval}&limit=${Math.min(limit, 1000)}`, 30);
      return rows.map(toCandle).filter((c) => c.t < end);
    }
    for (let i = 0; i < 20 && cursor < end; i++) {
      const rows = await get<(string | number)[][]>(
        `/klines?symbol=${p}&interval=${interval}&startTime=${cursor}&endTime=${end - 1}&limit=1000`,
        req.timeframe === "1D" ? 3600 : 30,
      );
      if (!rows.length) break;
      rows.forEach((r) => out.push(toCandle(r)));
      const lastOpen = Number(rows[rows.length - 1][0]);
      if (rows.length < 1000) break;
      cursor = lastOpen + 1;
    }
    return out;
  },
};

function toCandle(r: (string | number)[]): Candle {
  return { t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) };
}
