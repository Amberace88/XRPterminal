import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { syncTraderOnchain } from "@/lib/social/server";
import { fail, log, ok, rateLimit } from "@/lib/server/api";

export const maxDuration = 60;

/** POST /api/traders/sync — recompute on-chain (XRPL DEX) metrics for the signed-in trader's verified wallet. */
export async function POST() {
  if (!isSupabaseConfigured()) return fail("NOT_CONFIGURED", "Verified traders require a Supabase account database.", 503);
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in first.", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return fail("NOT_CONFIGURED", "Server database key not configured.", 503);
  const rl = rateLimit(`trader-sync:${user.id}`, 1, 10 * 60_000);
  if (!rl.allowed) return fail("RATE_LIMITED", `Metrics were refreshed recently. Try again in ${Math.ceil(rl.resetIn / 60_000)} min.`, 429, true);
  const { data: acc } = await admin.from("trader_accounts").select("id, trader_id, address").eq("user_id", user.id).eq("status", "VERIFIED").limit(1).maybeSingle();
  if (!acc) return fail("NOT_FOUND", "No verified wallet on your trader profile.", 404);
  try {
    const stored = await syncTraderOnchain(admin, acc.trader_id, acc.id, acc.address);
    return ok(stored);
  } catch (e) {
    log("warn", "trader sync failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("XRPL_UNAVAILABLE", "Could not read the ledger right now.", 503, true);
  }
}
