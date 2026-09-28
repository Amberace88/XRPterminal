import { fail, log, ok } from "@/lib/server/api";
import { evaluateMaturedForecasts, verifyCronSecret } from "@/lib/forecast/service";

export const runtime = "nodejs";

/**
 * POST /api/jobs/forecast/evaluate — daily cron (netlify/functions/forecast-evaluate.mts).
 * Evaluates every matured, not-yet-evaluated published forecast (append-only evaluations).
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return fail("NOT_CONFIGURED", "CRON_SECRET is not configured.", 503);
  if (!verifyCronSecret(req)) return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
  try {
    return ok(await evaluateMaturedForecasts());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "DB_NOT_CONFIGURED") return fail("DB_NOT_CONFIGURED", "Supabase service role is not configured — nothing to evaluate.", 503);
    log("error", "jobs/forecast/evaluate failed", { error: msg });
    return fail("EVALUATE_FAILED", "Forecast evaluation failed.", 500, true);
  }
}
