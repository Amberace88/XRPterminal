import { z } from "zod";
import { canAddConnectedAccount, canConnectExchange, planOf } from "@/lib/entitlements";
import { ExchangeApiError } from "@/lib/exchanges/types";
import { getExchangeProvider } from "@/lib/exchanges/binance";
import { encryptSecret, keyFingerprint, parseEncryptionKey } from "@/lib/portfolio/crypto";
import { ACCOUNT_COLUMNS, mapDbError, requireUser, rowToAccount, type ConnectedAccountRow } from "@/lib/portfolio/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { serverEnv } from "@/lib/server/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/portfolio/exchange/connect { exchange: "binance", apiKey, apiSecret, label? }   (BETA)
 * 1. Signed-in Pro/Pro+ user, within connected-account limit
 * 2. Key permissions inspected via Binance /sapi/v1/account/apiRestrictions — anything beyond READ is rejected
 * 3. Key + secret encrypted with AES-256-GCM (CREDENTIALS_ENCRYPTION_KEY) and stored in a service-role-only table
 * Secrets are never logged or returned.
 */
export const dynamic = "force-dynamic";

const Body = z.object({
  exchange: z.enum(["binance"]),
  apiKey: z.string().trim().min(16).max(256).regex(/^[A-Za-z0-9]+$/, "API key contains invalid characters"),
  apiSecret: z.string().trim().min(16).max(256).regex(/^[A-Za-z0-9]+$/, "API secret contains invalid characters"),
  label: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  const limited = limitOr429(req, "exchange-connect", 5, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;

  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user, plan } = r.ctx;
  if (!canConnectExchange(plan)) return fail("PLAN_REQUIRED", "Exchange connections require the Pro plan.", 403);

  const { count } = await sb.from("connected_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!canAddConnectedAccount(plan, count ?? 0))
    return fail("PLAN_LIMIT", `Your ${planOf(plan).name} plan's connected-account limit is reached.`, 403);

  const rawKey = serverEnv().credentialsKey;
  try {
    parseEncryptionKey(rawKey);
  } catch {
    return fail("NOT_CONFIGURED", "Credential encryption is not configured on this server, so exchange keys cannot be stored safely.", 501);
  }
  const admin = getSupabaseAdmin();
  if (!admin) return fail("NOT_CONFIGURED", "Secure credential storage is not configured on this server.", 501);

  const provider = getExchangeProvider(b.data.exchange);
  if (!provider) return fail("UNSUPPORTED_EXCHANGE", "Exchange not supported.", 400);
  const creds = { apiKey: b.data.apiKey, apiSecret: b.data.apiSecret };
  const fingerprint = keyFingerprint(creds.apiKey);

  let check;
  try {
    check = await provider.checkReadOnly(creds);
  } catch (e) {
    const err = e as ExchangeApiError;
    log("warn", "exchange connect: permission check failed", { exchange: b.data.exchange, fingerprint, status: err.status, providerCode: err.providerCode });
    return fail("EXCHANGE_ERROR", err.message || "Could not verify the API key.", err.status && err.status < 600 ? err.status : 502, err.status >= 500);
  }
  if (!check.ok)
    return fail(
      "PERMISSIONS_REJECTED",
      `This key is not read-only and was rejected (${check.reasons.join("; ")}). Create a new key with ONLY "Enable Reading" and try again.`,
      422,
    );

  const { data: acct, error } = await sb
    .from("connected_accounts")
    .insert({
      user_id: user.id,
      type: "EXCHANGE_ACCOUNT",
      exchange: b.data.exchange,
      label: (b.data.label ?? "Binance").trim().slice(0, 60),
      key_fingerprint: fingerprint,
      permissions: check.permissions,
      status: "active",
    })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) return mapDbError(error.message);

  const aad = `${user.id}:${b.data.exchange}:${fingerprint}`;
  const { error: sErr } = await admin.from("connected_account_secrets").insert({
    account_id: (acct as ConnectedAccountRow).id,
    user_id: user.id,
    encrypted_api_key: encryptSecret(creds.apiKey, rawKey, aad),
    encrypted_secret: encryptSecret(creds.apiSecret, rawKey, aad),
    key_version: "v1",
  });
  if (sErr) {
    await sb.from("connected_accounts").delete().eq("id", (acct as ConnectedAccountRow).id).eq("user_id", user.id);
    log("error", "exchange connect: secret storage failed", { fingerprint });
    return fail("DB_ERROR", "Could not store the credentials securely. Nothing was saved.", 500, true);
  }
  log("info", "exchange connected", { exchange: b.data.exchange, fingerprint, userId: user.id });
  return ok({ account: rowToAccount(acct as ConnectedAccountRow), ipRestricted: check.ipRestricted }, { status: 201 });
}
