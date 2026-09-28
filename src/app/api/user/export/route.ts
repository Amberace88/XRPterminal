import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { fail, limitOr429, ok } from "@/lib/server/api";
import { redactSecrets } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/server";

export const dynamic = "force-dynamic";

/**
 * GDPR data access / export (spec §193, §195). Reads the signed-in user's rows with THEIR
 * session (RLS applies), so only data they own is returned. Secret-like columns (encrypted
 * exchange credentials, tokens) are stripped. Tables owned by other modules are included
 * when they exist; missing tables are skipped and reported.
 */
const USER_TABLES = [
  "subscriptions",
  "notifications",
  "share_cards",
  "gdpr_requests",
  "audit_logs",
  // other modules (included if present)
  "wallets",
  "wallet_labels",
  "connected_accounts",
  "portfolio_lots",
  "watchlists",
  "alerts",
  "alert_rules",
  "alert_events",
  "follows",
  "paper_accounts",
  "paper_orders",
  "paper_fills",
  "paper_positions",
  "paper_trades",
  "paper_journal",
  "replay_sessions",
  "strategies",
  "backtests",
  "ai_briefs",
] as const;

export async function GET(req: Request) {
  const limited = limitOr429(req, "user-export", 5, 10 * 60_000);
  if (limited) return limited;
  const sb = await getSupabaseServer();
  if (!sb) return fail("NOT_CONFIGURED", "Accounts are not enabled — export your browser data from Settings instead.", 503);
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return fail("UNAUTHENTICATED", "Sign in to export account data.", 401);

  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const tables: Record<string, unknown[]> = {};
  const skipped: string[] = [];
  for (const t of USER_TABLES) {
    const { data, error } = await sb.from(t).select("*").eq("user_id", user.id).limit(10_000);
    if (error) {
      skipped.push(t);
      continue;
    }
    tables[t] = (data ?? []).map((r) => redactSecrets(r as Record<string, unknown>));
  }

  const admin = getSupabaseAdmin();
  if (admin) {
    await admin.from("gdpr_requests").insert({ user_id: user.id, kind: "export", status: "completed", completed_at: new Date().toISOString() });
    await writeAudit(admin, { action: "account.data_exported", actorId: user.id, userId: user.id, req });
  }

  return ok({
    exportedAt: new Date().toISOString(),
    format: "xrp-terminal-export/v1",
    account: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at,
    },
    profile: profile ? redactSecrets(profile as Record<string, unknown>) : null,
    tables,
    skippedTables: skipped,
    note: "Secret values (such as encrypted exchange API credentials) are never exported. Browser-only guest data is exported separately from Settings → Data export.",
  });
}
