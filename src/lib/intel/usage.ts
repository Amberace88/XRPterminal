import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, getCurrentRole } from "@/lib/supabase/server";
import { clientIp, log, rateLimit } from "@/lib/server/api";
import { aiDailyLimit, planOf } from "@/lib/entitlements";

/** AI usage tracking (spec §159, §239) and per-plan daily quotas (spec §138). */
export type AiFeature = "brief" | "ask" | "claim_check" | "news_summary";

export async function trackAiUsage(opts: {
  userId: string | null;
  feature: AiFeature;
  model?: string | null;
  usage?: { input_tokens: number; output_tokens: number } | null;
  webSearch?: boolean;
}) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const { error } = await sb.from("ai_usage").insert({
      user_id: opts.userId,
      feature: opts.feature,
      model: opts.model ?? null,
      input_tokens: opts.usage?.input_tokens ?? 0,
      output_tokens: opts.usage?.output_tokens ?? 0,
      web_search: !!opts.webSearch,
    });
    if (error) log("warn", "ai_usage insert failed", { error: error.message });
  } catch (e) {
    log("warn", "ai_usage insert failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

async function countToday(userId: string, features: AiFeature[]): Promise<number | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await sb
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("feature", features)
    .gte("created_at", since.toISOString());
  if (error) return null;
  return count ?? 0;
}

export interface QuotaOk {
  userId: string | null;
  plan: string;
  limit: number;
}

/**
 * Enforce daily AI quotas: signed-in users by plan (ai_usage count, falling back to an
 * in-memory counter), guests by IP at the Free-plan limit.
 */
export async function enforceAiQuota(req: Request, kind: "ai" | "claim"): Promise<QuotaOk | NextResponse> {
  const { user, plan } = await getCurrentRole();
  const p = planOf(plan);
  const limit = kind === "claim" ? p.limits.claimChecksPerDay : aiDailyLimit(plan);
  const features: AiFeature[] = kind === "claim" ? ["claim_check"] : ["ask", "news_summary"];
  const deny = (used: number | null) =>
    NextResponse.json(
      {
        ok: false,
        error: {
          code: "QUOTA_EXCEEDED",
          message: `Daily ${kind === "claim" ? "Claim Check" : "AI"} limit reached for the ${p.name} plan (${limit}/day${used !== null ? `, used ${used}` : ""}). Resets at 00:00 UTC.`,
          retryable: false,
        },
      },
      { status: 429 },
    );
  if (user) {
    const used = await countToday(user.id, features);
    if (used !== null) return used >= limit ? deny(used) : { userId: user.id, plan: p.id, limit };
    const r = rateLimit(`quota-${kind}:u:${user.id}`, limit, 86_400_000);
    return r.allowed ? { userId: user.id, plan: p.id, limit } : deny(null);
  }
  const r = rateLimit(`quota-${kind}:ip:${clientIp(req)}`, limit, 86_400_000);
  return r.allowed ? { userId: null, plan: "free", limit } : deny(null);
}
