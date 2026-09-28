import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { clientIp, fail, log } from "@/lib/server/api";
import { evaluateAdminAccess } from "./guard";

export interface AdminContext {
  user: User;
  /** service-role client — only used AFTER the role check passed */
  admin: SupabaseClient;
}

/** Server-side admin gate for route handlers. Role is read from the DB, never from the client. */
export async function requireAdmin(): Promise<{ ctx: AdminContext } | { response: NextResponse }> {
  const configured = isSupabaseConfigured();
  const sb = configured ? await getSupabaseServer() : null;
  let user: User | null = null;
  let role: string | null = null;
  let status: string | null = null;
  if (sb) {
    const { data } = await sb.auth.getUser();
    user = data.user ?? null;
    if (user) {
      const { data: p } = await sb.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
      role = (p?.role as string | undefined) ?? null;
      status = (p?.status as string | undefined) ?? null;
    }
  }
  const access = evaluateAdminAccess({ configured, userId: user?.id, role, status });
  if (!access.ok) {
    const msg =
      access.reason === "not_configured"
        ? "Admin requires a database connection (Supabase not configured)."
        : access.reason === "unauthenticated"
          ? "Sign in required."
          : "Admin role required.";
    return { response: fail(access.reason.toUpperCase(), msg, access.status) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { response: fail("SERVICE_ROLE_MISSING", "SUPABASE_SERVICE_ROLE_KEY is not configured on the server.", 503) };
  return { ctx: { user: user!, admin } };
}

const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i;

/** Append-only audit log (spec §143). Failures are logged but never block the action result. */
export async function writeAudit(
  admin: SupabaseClient,
  entry: { action: string; actorId?: string | null; userId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; req?: Request },
): Promise<void> {
  const ip = entry.req ? clientIp(entry.req) : null;
  const { error } = await admin.from("audit_logs").insert({
    action: entry.action,
    actor_id: entry.actorId ?? null,
    user_id: entry.userId ?? null,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: ip && IP_RE.test(ip) ? ip : null,
  });
  if (error) log("error", "audit insert failed", { action: entry.action, error: error.message });
}
