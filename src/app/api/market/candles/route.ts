import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCandleSeries } from "@/lib/providers/market/registry";
import { fail, limitOr429, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({
  pair: z.enum(["XRP-USD", "XRP-EUR", "XRP-BTC", "XRP-ETH", "BTC-USD", "ETH-USD"]).default("XRP-USD"),
  tf: z.enum(["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"]).default("1h"),
  limit: z.coerce.number().int().min(10).max(1500).default(300),
  start: z.coerce.number().int().positive().optional(),
  end: z.coerce.number().int().positive().optional(),
  prefer: z.enum(["coinbase", "kraken", "bitstamp", "binance"]).optional(),
});

const CACHE: Record<string, number> = { "1m": 15, "5m": 30, "15m": 60, "1h": 120, "4h": 300, "1D": 900, "1W": 3600, "1M": 3600 };

export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "candles", 120, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const { pair, tf, limit, start, end, prefer } = q.data;
  try {
    const series = await getCandleSeries({ pair, timeframe: tf, limit: start ? undefined : limit, start, end, prefer });
    if (!start && series.candles.length > limit) series.candles = series.candles.slice(-limit);
    return ok(series, { cacheSeconds: CACHE[tf] });
  } catch (e) {
    return fail("MARKET_DATA_UNAVAILABLE", e instanceof Error ? e.message : "Market data temporarily unavailable", 503, true);
  }
}
