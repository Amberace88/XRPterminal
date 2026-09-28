import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDailyHistory } from "@/lib/providers/market/registry";
import { fail, limitOr429, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({
  pair: z.enum(["XRP-USD", "XRP-EUR", "BTC-USD", "ETH-USD"]).default("XRP-USD"),
});

/** Full daily history (single provider, validated). Heavily cached — daily data. */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "history", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const series = await getDailyHistory(q.data.pair);
    return ok(series, { cacheSeconds: 1800 });
  } catch (e) {
    return fail("HISTORY_UNAVAILABLE", e instanceof Error ? e.message : "Historical data temporarily unavailable", 503, true);
  }
}
