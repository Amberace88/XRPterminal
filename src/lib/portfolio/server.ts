import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fail } from "@/lib/server/api";
import type { ConnectedAccount } from "./types";

export type AuthCtx = { sb: SupabaseClient; user: User; plan: string };

/** Resolve the signed-in user + plan (from the DB, never from the client). Returns a response on failure. */
export async function requireUser(): Promise<{ ctx: AuthCtx } | { error: ReturnType<typeof fail> }> {
  if (!isSupabaseConfigured()) return { error: fail("NOT_CONFIGURED", "Accounts are not enabled on this deployment — data stays in this browser (guest mode).", 501) };
  const sb = await getSupabaseServer();
  if (!sb) return { error: fail("NOT_CONFIGURED", "Accounts are not enabled on this deployment.", 501) };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: fail("UNAUTHORIZED", "Sign in required.", 401) };
  const { data: profile } = await sb.from("profiles").select("plan").eq("id", data.user.id).maybeSingle();
  return { ctx: { sb, user: data.user, plan: (profile?.plan as string) ?? "free" } };
}

export interface ConnectedAccountRow {
  id: string;
  type: ConnectedAccount["type"];
  label: string;
  address: string | null;
  tag: number | null;
  exchange: "binance" | null;
  key_fingerprint: string | null;
  permissions: Record<string, boolean> | null;
  status: ConnectedAccount["status"];
  is_primary: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export const ACCOUNT_COLUMNS = "id, type, label, address, tag, exchange, key_fingerprint, permissions, status, is_primary, last_synced_at, created_at";

export function rowToAccount(r: ConnectedAccountRow): ConnectedAccount {
  return {
    id: r.id,
    type: r.type,
    label: r.label,
    address: r.address,
    tag: r.tag,
    exchange: r.exchange,
    keyFingerprint: r.key_fingerprint,
    permissions: r.permissions,
    status: r.status,
    isPrimary: r.is_primary,
    lastSyncedAt: r.last_synced_at ? Date.parse(r.last_synced_at) : null,
    createdAt: Date.parse(r.created_at),
  };
}

/** Map DB trigger errors (plan limit) to friendly API errors. */
export function mapDbError(message: string) {
  if (message.includes("PLAN_LIMIT")) return fail("PLAN_LIMIT", "Your plan's connected-account limit is reached. Upgrade to add more.", 403);
  if (message.includes("PLAN_REQUIRED")) return fail("PLAN_REQUIRED", "Exchange connections require the Pro plan.", 403);
  if (message.includes("duplicate key")) return fail("DUPLICATE", "This account is already connected.", 409);
  return fail("DB_ERROR", "Could not save the connected account.", 500, true);
}
