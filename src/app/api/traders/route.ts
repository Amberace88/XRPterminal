import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { rankTraders, SCORE_WEIGHTS, MIN_TRADES, MIN_SPAN_DAYS } from "@/lib/social/metrics";
import { privacyOf, redactMetrics, type StoredMetrics } from "@/lib/social/server";
import { fail, limitOr429, ok, parseQuery } from "@/lib/server/api";
import type { PublicTrader, VerificationStatus } from "@/lib/social/types";

const Q = z.object({ sort: z.enum(["score", "riskAdjusted", "consistency", "drawdown", "sample"]).default("score") });

/** GET /api/traders — verified, public traders + leaderboard (never ROI-only; insufficient samples hidden). */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "traders", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const methodology = {
    weights: SCORE_WEIGHTS,
    minTrades: MIN_TRADES,
    minSpanDays: MIN_SPAN_DAYS,
    note: "Composite of risk-adjusted return (mean/stdev of per-trade returns), consistency (share of positive months), max drawdown, profit factor and sample size. Not ranked by ROI. Traders below the minimum sample are listed but not ranked.",
  };
  if (!isSupabaseConfigured()) return ok({ configured: false, traders: [] as PublicTrader[], ranked: [] as PublicTrader[], methodology });
  const sb = await getSupabaseServer();
  const { data, error } = await sb!
    .from("traders")
    .select("id, display_name, avatar_url, bio, verification_status, verified_at, public_profile, public_pnl, public_positions, public_trades, public_history, public_wallet, anonymous_stats, trader_metrics(metrics)")
    .eq("verification_status", "VERIFIED")
    .eq("public_profile", true)
    .limit(500);
  if (error) return fail("DB_ERROR", "Trader directory unavailable.", 503, true);
  const admin = getSupabaseAdmin();
  const walletIds = (data ?? []).filter((r) => r.public_wallet).map((r) => r.id as string);
  const wallets = new Map<string, string>();
  if (admin && walletIds.length) {
    const { data: acc } = await admin.from("trader_accounts").select("trader_id, address").in("trader_id", walletIds).eq("status", "VERIFIED");
    for (const a of acc ?? []) wallets.set(a.trader_id as string, a.address as string);
  }
  const traders: PublicTrader[] = (data ?? []).map((r) => {
    const privacy = privacyOf(r);
    const tm = Array.isArray(r.trader_metrics) ? r.trader_metrics[0] : r.trader_metrics;
    const stored = redactMetrics(((tm as { metrics?: StoredMetrics } | null)?.metrics ?? null) as StoredMetrics | null, privacy);
    return {
      id: r.id as string,
      display_name: r.display_name as string,
      avatar_url: (r.avatar_url as string) ?? null,
      bio: (r.bio as string) ?? null,
      verification_status: r.verification_status as VerificationStatus,
      verified_at: (r.verified_at as string) ?? null,
      wallet: privacy.public_wallet ? (wallets.get(r.id as string) ?? null) : null,
      privacy,
      metrics: stored?.metrics ?? null,
    };
  });
  return ok({ configured: true, traders, ranked: rankTraders(traders, q.data.sort).map((t) => t.id), methodology }, { cacheSeconds: 120 });
}
