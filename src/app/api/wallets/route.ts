import type { NextRequest } from "next/server";
import { z } from "zod";
import { canAddConnectedAccount, planOf } from "@/lib/entitlements";
import { fail, limitOr429, log, ok, parseBody, parseQuery } from "@/lib/server/api";
import { ACCOUNT_COLUMNS, mapDbError, requireUser, rowToAccount, type ConnectedAccountRow } from "@/lib/portfolio/server";
import { looksLikeSecret, SECRET_WARNING } from "@/lib/portfolio/validation";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { fetchAccountExistence } from "@/lib/xrpl/server";

/**
 * Connected accounts for signed-in users (Supabase). Guests keep accounts in browser storage.
 *  GET    /api/wallets            → { accounts, plan, limit }
 *  POST   /api/wallets            { address, label? } → adds an XRPL_WALLET (format + existence + plan limit checked)
 *  PATCH  /api/wallets            { id, label?, isPrimary? }
 *  DELETE /api/wallets?id=<uuid>  → removes any own connected account (secrets cascade)
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user, plan } = r.ctx;
  const { data, error } = await sb.from("connected_accounts").select(ACCOUNT_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: true });
  if (error) return fail("DB_ERROR", "Could not load connected accounts.", 500, true);
  const limit = planOf(plan).limits.connectedAccounts;
  return ok({ accounts: (data as ConnectedAccountRow[]).map(rowToAccount), plan, limit: Number.isFinite(limit) ? limit : null });
}

const AddBody = z.object({ address: z.string().min(1).max(500), label: z.string().max(60).optional() });

export async function POST(req: Request) {
  const limited = limitOr429(req, "wallets-add", 20, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, AddBody);
  if ("error" in b) return b.error;
  if (looksLikeSecret(b.data.address)) return fail("SECRET_REJECTED", SECRET_WARNING, 400);
  const n = normalizeXrplAddress(b.data.address);
  if (!n.ok) return fail("INVALID_ADDRESS", n.reason, 400);

  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user, plan } = r.ctx;

  const { count, error: cErr } = await sb.from("connected_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (cErr) return fail("DB_ERROR", "Could not check your plan limit.", 500, true);
  if (!canAddConnectedAccount(plan, count ?? 0))
    return fail("PLAN_LIMIT", `Your ${planOf(plan).name} plan allows ${planOf(plan).limits.connectedAccounts} connected account(s). Upgrade to add more.`, 403);

  try {
    const ex = await fetchAccountExistence(n.classic);
    if (!ex.exists) return fail("ACCOUNT_NOT_FOUND", "This address does not exist on the validated XRP Ledger (never funded or deleted).", 404);
  } catch (e) {
    log("warn", "wallets add: xrpl unavailable", { error: (e as Error).message });
    return fail("XRPL_UNAVAILABLE", "Could not reach an XRPL server to verify the account. Try again.", 503, true);
  }

  const { data, error } = await sb
    .from("connected_accounts")
    .insert({
      user_id: user.id,
      type: "XRPL_WALLET",
      address: n.classic,
      tag: typeof n.tag === "number" ? n.tag : null,
      label: (b.data.label ?? "").trim().slice(0, 60),
      status: "active",
      is_primary: (count ?? 0) === 0,
      last_synced_at: new Date().toISOString(),
    })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) return mapDbError(error.message);
  return ok({ account: rowToAccount(data as ConnectedAccountRow) }, { status: 201 });
}

const PatchBody = z.object({ id: z.string().uuid(), label: z.string().max(60).optional(), isPrimary: z.boolean().optional() });

export async function PATCH(req: Request) {
  const b = await parseBody(req, PatchBody);
  if ("error" in b) return b.error;
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user } = r.ctx;
  if (b.data.isPrimary) await sb.from("connected_accounts").update({ is_primary: false }).eq("user_id", user.id);
  const patch: Record<string, unknown> = {};
  if (b.data.label !== undefined) patch.label = b.data.label.trim();
  if (b.data.isPrimary !== undefined) patch.is_primary = b.data.isPrimary;
  const { data, error } = await sb.from("connected_accounts").update(patch).eq("id", b.data.id).eq("user_id", user.id).select(ACCOUNT_COLUMNS).maybeSingle();
  if (error) return fail("DB_ERROR", "Could not update the account.", 500, true);
  if (!data) return fail("NOT_FOUND", "Account not found.", 404);
  return ok({ account: rowToAccount(data as ConnectedAccountRow) });
}

const DelQuery = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const q = parseQuery(req, DelQuery);
  if ("error" in q) return q.error;
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { sb, user } = r.ctx;
  const { data, error } = await sb.from("connected_accounts").delete().eq("id", q.data.id).eq("user_id", user.id).select("id");
  if (error) return fail("DB_ERROR", "Could not remove the account.", 500, true);
  if (!data?.length) return fail("NOT_FOUND", "Account not found.", 404);
  return ok({ removed: q.data.id });
}
