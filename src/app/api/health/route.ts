import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isAiConfigured, isServiceRoleConfigured, isStripeConfigured, serverEnv } from "@/lib/server/env";
import { getMarketProviderHealth } from "@/lib/providers/market/registry";
import { limitOr429, ok } from "@/lib/server/api";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "down" | "not_configured";

/**
 * System health (spec §237) for uptime monitors and Admin → System.
 * Reports configuration booleans only — never secret values.
 */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "health", 60, 60_000);
  if (limited) return limited;
  const t0 = Date.now();

  let database: { status: CheckStatus; latencyMs?: number; message?: string } = { status: "not_configured" };
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    if (!admin) database = { status: "degraded", message: "Service role key missing — cannot run server checks" };
    else {
      const d0 = Date.now();
      const { error } = await admin.from("plans").select("id", { count: "exact", head: true });
      database = error ? { status: "down", latencyMs: Date.now() - d0, message: error.message } : { status: "ok", latencyMs: Date.now() - d0 };
    }
  }

  // In-memory market provider status from this server instance (updated by real requests).
  const market = getMarketProviderHealth();
  const env = serverEnv();
  const checks = {
    api: { status: "ok" as CheckStatus },
    database,
    marketProviders: market.map((m) => ({ id: m.id, status: m.status, latencyMs: m.latencyMs, lastSuccess: m.lastSuccess })),
    configuration: {
      supabase: isSupabaseConfigured(),
      serviceRole: isServiceRoleConfigured(),
      stripe: isStripeConfigured(),
      stripeWebhook: Boolean(env.stripeWebhookSecret),
      stripePrices: Boolean(env.stripePricePro && env.stripePriceProPlus),
      anthropic: isAiConfigured(),
      cronSecret: Boolean(env.cronSecret),
      credentialsEncryption: Boolean(env.credentialsKey),
    },
  };
  const overall: CheckStatus = database.status === "down" ? "degraded" : "ok";
  return ok(
    {
      status: overall,
      time: new Date().toISOString(),
      durationMs: Date.now() - t0,
      region: process.env.AWS_REGION || process.env.NETLIFY_REGION || null,
      commit: process.env.COMMIT_REF?.slice(0, 12) || null,
      checks,
    },
    { cacheSeconds: 0 },
  );
}
