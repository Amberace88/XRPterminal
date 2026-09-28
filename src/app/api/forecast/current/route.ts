import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";
import { horizonByKey, horizonStatus } from "@/lib/forecast/horizons";
import { buildCurrentResponse, loadDaily } from "@/lib/forecast/service";

export const runtime = "nodejs";

const Q = z.object({
  h: z.enum(["7", "30", "90", "180", "365", "1095", "1825", "7D", "30D", "90D", "180D", "1Y", "3Y", "5Y"]).default("30"),
});

/**
 * GET /api/forecast/current?h=30
 * Live model output computed server-side from completed daily candles (memoised per as-of date).
 * `publication.status` says whether an immutable published record exists for this as-of date.
 */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "forecast-current", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const days = /^\d+$/.test(q.data.h) ? Number(q.data.h) : horizonByKey(q.data.h)!.days;
  try {
    const { candles } = await loadDaily();
    const st = horizonStatus(candles.length, days);
    if (st.status === "disabled") return fail("HORIZON_DISABLED", st.reason, 422);
    const data = await buildCurrentResponse(days);
    return ok(data, { cacheSeconds: 600 });
  } catch (e) {
    log("error", "forecast/current failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("FORECAST_UNAVAILABLE", "Scenario model could not be computed — market history is temporarily unavailable.", 503, true);
  }
}
