import type { NextRequest } from "next/server";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { privacyOf, redactMetrics, type StoredMetrics } from "@/lib/social/server";
import { fail, limitOr429, ok } from "@/lib/server/api";

/** GET /api/traders/:id — public profile respecting the trader's privacy choices. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = limitOr429(req, "trader-profile", 60, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("VALIDATION_ERROR", "Invalid trader id", 400);
  if (!isSupabaseConfigured()) return fail("NOT_CONFIGURED", "Verified traders require the account database, which is not configured.", 503);
  const admin = getSupabaseAdmin();
  if (!admin) return fail("NOT_CONFIGURED", "Trader profiles require the server database key.", 503);
  const { data: t } = await admin.from("traders").select("*").eq("id", id).maybeSingle();
  const user = await getCurrentUser();
  const isOwner = !!t && !!user && t.user_id === user.id;
  if (!t || (!isOwner && !(t.verification_status === "VERIFIED" && t.public_profile))) return fail("NOT_FOUND", "Trader not found or profile is private.", 404);
  const privacy = privacyOf(t);
  const eff = isOwner ? { ...privacy, public_pnl: true, public_positions: true, public_history: true, public_trades: true, public_wallet: true } : privacy;
  const { data: m } = await admin.from("trader_metrics").select("metrics, computed_at, source, quote_asset").eq("trader_id", id).maybeSingle();
  const stored = redactMetrics((m?.metrics as StoredMetrics | undefined) ?? null, eff);
  let trades: unknown[] = [];
  if (eff.public_trades) {
    const { data: tr } = await admin
      .from("trader_trades")
      .select("entry_time, exit_time, qty, entry_price, exit_price, pnl, return_pct, holding_ms, exit_hash, source, quote_asset")
      .eq("trader_id", id)
      .order("exit_time", { ascending: false })
      .limit(500);
    trades = (tr ?? []).map((r) => ({
      entryTime: Date.parse(r.entry_time),
      exitTime: Date.parse(r.exit_time),
      qty: Number(r.qty),
      entryPrice: Number(r.entry_price),
      exitPrice: Number(r.exit_price),
      pnl: eff.public_pnl ? Number(r.pnl) : null,
      returnPct: Number(r.return_pct),
      holdingMs: Number(r.holding_ms),
      exitHash: r.exit_hash,
      source: r.source,
      quoteAsset: r.quote_asset,
    }));
  }
  let wallet: string | null = null;
  if (eff.public_wallet) {
    const { data: acc } = await admin.from("trader_accounts").select("address").eq("trader_id", id).eq("status", "VERIFIED").limit(1).maybeSingle();
    wallet = (acc?.address as string) ?? null;
  }
  return ok({
    trader: { id: t.id, display_name: t.display_name, avatar_url: t.avatar_url, bio: t.bio, verification_status: t.verification_status, verified_at: t.verified_at, privacy, wallet },
    isOwner,
    metrics: stored?.metrics ?? null,
    open: stored?.open ?? null,
    monthly: stored?.monthly ?? [],
    trades,
    source: m?.source ?? null,
    quoteAsset: m?.quote_asset ?? null,
    computedAt: m?.computed_at ?? null,
  });
}
