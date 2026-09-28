import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { findChallengeTx } from "@/lib/social/verification";
import { fetchAccountTx, syncTraderOnchain } from "@/lib/social/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";

export const maxDuration = 60;
const B = z.object({ address: z.string().trim().min(25).max(60) });

/** POST /api/traders/verify — scan the address's recent transactions for the challenge memo. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "trader-verify", 12, 10 * 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isSupabaseConfigured()) return fail("NOT_CONFIGURED", "Trader verification requires a Supabase account database.", 503);
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in to verify a wallet.", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return fail("NOT_CONFIGURED", "Verification backend (service role) is not configured.", 503);
  const addr = normalizeXrplAddress(b.data.address);
  if (!addr.ok) return fail("VALIDATION_ERROR", addr.reason, 400);

  const { data: acc } = await admin.from("trader_accounts").select("*").eq("user_id", user.id).eq("address", addr.classic).maybeSingle();
  if (!acc) return fail("NOT_FOUND", "No verification challenge for this address. Create one first.", 404);
  if (acc.status === "VERIFIED") return ok({ status: "VERIFIED", txHash: acc.verified_tx_hash });
  if (!acc.challenge_code || !acc.challenge_created_at) return fail("NOT_FOUND", "Challenge missing — create a new one.", 404);
  const notBefore = Date.parse(acc.challenge_created_at) - 60_000;
  const notAfter = Date.parse(acc.challenge_expires_at);
  if (Date.now() > notAfter + 5 * 60_000) {
    await admin.from("trader_accounts").update({ status: "UNVERIFIED" }).eq("id", acc.id);
    return fail("EXPIRED", "Challenge expired (48h). Create a new code.", 410);
  }
  let entries;
  try {
    entries = await fetchAccountTx(addr.classic, { maxPages: 1, pageSize: 200 });
  } catch (e) {
    log("warn", "account_tx failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("XRPL_UNAVAILABLE", "XRPL servers are unreachable right now. Try again shortly.", 503, true);
  }
  const match = findChallengeTx(entries, { address: addr.classic, code: acc.challenge_code, notBefore, notAfter });
  if (!match) return ok({ status: "PENDING", message: "No validated transaction with the memo found yet. Ledger validation takes ~4 seconds after you send it." });

  const verifiedAt = new Date().toISOString();
  await admin
    .from("trader_accounts")
    .update({ status: "VERIFIED", verified_at: verifiedAt, verified_tx_hash: match.hash, verified_ledger: match.ledgerIndex, challenge_code: null })
    .eq("id", acc.id);
  await admin.from("traders").update({ verification_status: "VERIFIED", verified_at: verifiedAt }).eq("id", acc.trader_id);
  let metrics = null;
  try {
    metrics = await syncTraderOnchain(admin, acc.trader_id, acc.id, addr.classic);
  } catch (e) {
    log("warn", "initial trader sync failed", { error: e instanceof Error ? e.message : String(e) });
  }
  return ok({ status: "VERIFIED", txHash: match.hash, ledgerIndex: match.ledgerIndex, metrics: metrics?.metrics ?? null });
}
