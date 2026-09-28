import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";
import { horizonByKey, horizonStatus } from "@/lib/forecast/horizons";
import { computeEvaluation, loadDaily } from "@/lib/forecast/service";

export const runtime = "nodejs";

const Q = z.object({
  h: z.enum(["7", "30", "90", "180", "365", "1095", "1825", "7D", "30D", "90D", "180D", "1Y", "3Y", "5Y"]).default("30"),
});

/**
 * GET /api/forecast/evaluation?h=30
 * Walk-forward evaluation of the scenario model vs baselines (computed from daily history,
 * memoised per as-of date and CDN-cached for 6 hours).
 */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "forecast-eval", 20, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const days = /^\d+$/.test(q.data.h) ? Number(q.data.h) : horizonByKey(q.data.h)!.days;
  try {
    const { candles } = await loadDaily();
    const horizon = horizonStatus(candles.length, days);
    if (horizon.status === "disabled") return fail("HORIZON_DISABLED", horizon.reason, 422);
    const { report, data } = await computeEvaluation(days);
    return ok({ report, horizon, provenance: data.provenance }, { cacheSeconds: 21_600 });
  } catch (e) {
    log("error", "forecast/evaluation failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("EVALUATION_UNAVAILABLE", "Walk-forward evaluation could not be computed — market history is temporarily unavailable.", 503, true);
  }
}
