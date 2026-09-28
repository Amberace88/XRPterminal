import type { NextRequest } from "next/server";
import { z } from "zod";
import { getTicker } from "@/lib/providers/market/registry";
import { fail, limitOr429, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({
  pair: z.enum(["XRP-USD", "XRP-EUR", "XRP-BTC", "XRP-ETH", "BTC-USD", "ETH-USD"]).default("XRP-USD"),
  prefer: z.enum(["coinbase", "kraken", "bitstamp", "binance"]).optional(),
});

export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "ticker", 240, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const { ticker, attempted } = await getTicker(q.data.pair, q.data.prefer);
    return ok({ ticker, attempted }, { cacheSeconds: 5 });
  } catch (e) {
    return fail("MARKET_DATA_UNAVAILABLE", e instanceof Error ? e.message : "Market data temporarily unavailable", 503, true);
  }
}
