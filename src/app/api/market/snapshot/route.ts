import type { NextRequest } from "next/server";
import { z } from "zod";
import { coingecko } from "@/lib/providers/market/snapshot";
import { fail, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({ symbol: z.enum(["XRP", "BTC", "ETH"]).default("XRP") });

export async function GET(req: NextRequest) {
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    return ok(await coingecko.getSnapshot(q.data.symbol), { cacheSeconds: 600 });
  } catch (e) {
    return fail("SNAPSHOT_UNAVAILABLE", e instanceof Error ? e.message : "Market snapshot unavailable", 503, true);
  }
}
