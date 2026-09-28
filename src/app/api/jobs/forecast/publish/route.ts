import { fail, log, ok } from "@/lib/server/api";
import { publishForecasts, verifyCronSecret } from "@/lib/forecast/service";

export const runtime = "nodejs";

/**
 * POST /api/jobs/forecast/publish — daily cron (netlify/functions/forecast-daily.mts).
 * Requires header `x-cron-secret: $CRON_SECRET`. Idempotent per (as-of date, horizon, model version).
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return fail("NOT_CONFIGURED", "CRON_SECRET is not configured.", 503);
  if (!verifyCronSecret(req)) return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
  try {
    return ok(await publishForecasts());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "DB_NOT_CONFIGURED") return fail("DB_NOT_CONFIGURED", "Supabase service role is not configured — forecasts cannot be published.", 503);
    log("error", "jobs/forecast/publish failed", { error: msg });
    return fail("PUBLISH_FAILED", "Forecast publication failed.", 500, true);
  }
}
