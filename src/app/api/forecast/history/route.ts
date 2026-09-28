import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";
import { buildHistoryResponse } from "@/lib/forecast/service";

export const runtime = "nodejs";

const Q = z.object({
  h: z.coerce.number().int().refine((v) => [0, 7, 30, 90, 180, 365, 1095, 1825].includes(v), "unsupported horizon").default(0),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

/**
 * GET /api/forecast/history?h=30&limit=60
 * Published (immutable) forecasts with their evaluations. `{configured:false}` without a database.
 */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "forecast-history", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const data = await buildHistoryResponse(q.data.h || null, q.data.limit);
    return ok(data, { cacheSeconds: data.configured ? 300 : 60 });
  } catch (e) {
    log("error", "forecast/history failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("HISTORY_UNAVAILABLE", "Published forecast history is temporarily unavailable.", 503, true);
  }
}
