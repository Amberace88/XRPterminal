import { z } from "zod";
import { getExchangeProvider } from "@/lib/exchanges/binance";
import type { ExchangeApiError } from "@/lib/exchanges/types";
import { decryptSecret } from "@/lib/portfolio/crypto";
import { requireUser } from "@/lib/portfolio/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { serverEnv } from "@/lib/server/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/portfolio/exchange/sync { id }  (BETA)
 * Decrypts the stored read-only key server-side, re-checks that it is STILL read-only, then reads balances.
 * Balances are returned to the owner only and are not persisted.
 */
export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  const limited = limitOr429(req, "exchange-sync", 10, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user } = r.ctx;

  const { data: acct } = await sb
    .from("connected_accounts")
    .select("id, exchange, key_fingerprint, type")
    .eq("id", b.data.id)
    .eq("user_id", user.id)
    .eq("type", "EXCHANGE_ACCOUNT")
    .maybeSingle();
  if (!acct) return fail("NOT_FOUND", "Exchange account not found.", 404);

  const admin = getSupabaseAdmin();
  const rawKey = serverEnv().credentialsKey;
  if (!admin || !rawKey) return fail("NOT_CONFIGURED", "Secure credential storage is not configured on this server.", 501);
  const { data: sec } = await admin
    .from("connected_account_secrets")
    .select("encrypted_api_key, encrypted_secret")
    .eq("account_id", acct.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sec) return fail("NOT_FOUND", "Stored credentials not found — reconnect the account.", 404);

  const aad = `${user.id}:${acct.exchange}:${acct.key_fingerprint}`;
  let creds: { apiKey: string; apiSecret: string };
  try {
    creds = { apiKey: decryptSecret(sec.encrypted_api_key, rawKey, aad), apiSecret: decryptSecret(sec.encrypted_secret, rawKey, aad) };
  } catch {
    log("error", "exchange sync: decrypt failed (key rotated or mismatched)", { accountId: acct.id });
    await sb.from("connected_accounts").update({ status: "error", status_message: "Credentials could not be decrypted — reconnect." }).eq("id", acct.id);
    return fail("DECRYPT_FAILED", "Stored credentials could not be decrypted. Please reconnect this account.", 409);
  }

  const provider = getExchangeProvider(String(acct.exchange));
  if (!provider) return fail("UNSUPPORTED_EXCHANGE", "Exchange not supported.", 400);
  try {
    const check = await provider.checkReadOnly(creds);
    if (!check.ok) {
      await sb.from("connected_accounts").update({ status: "rejected", status_message: check.reasons.join("; "), permissions: check.permissions }).eq("id", acct.id);
      return fail("PERMISSIONS_REJECTED", `This key is no longer read-only (${check.reasons.join("; ")}). Sync stopped — delete the key at the exchange and reconnect with read-only permissions.`, 422);
    }
    const balances = await provider.getBalances(creds);
    const syncedAt = new Date().toISOString();
    await sb.from("connected_accounts").update({ status: "active", status_message: null, last_synced_at: syncedAt, permissions: check.permissions }).eq("id", acct.id);
    return ok({ balances, syncedAt: Date.parse(syncedAt), source: `${provider.name} spot account (read-only API)` });
  } catch (e) {
    const err = e as ExchangeApiError;
    log("warn", "exchange sync failed", { accountId: acct.id, status: err.status, providerCode: err.providerCode });
    await sb.from("connected_accounts").update({ status: "error", status_message: err.message }).eq("id", acct.id);
    return fail("EXCHANGE_ERROR", err.message || "Exchange sync failed.", err.status && err.status < 600 ? err.status : 502, true);
  }
}
