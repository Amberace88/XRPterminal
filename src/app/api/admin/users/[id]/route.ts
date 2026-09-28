import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, writeAudit } from "@/lib/admin/server";
import { redactSecrets } from "@/lib/admin/guard";
import { fail, ok, parseBody } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();
const DAY = 86_400_000;

async function safeCount(admin: SupabaseClient, table: string, userId: string, sinceMs?: number): Promise<number | null> {
  let q = admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (sinceMs) q = q.gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

/** View a user: profile, auth metadata, subscriptions, usage counts, connected-account METADATA, audit events. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return fail("VALIDATION_ERROR", "Invalid user id", 400);
  const { admin, user: actor } = g.ctx;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, email, display_name, plan, subscription_status, role, status, timezone, locale, currency, social_visibility, referral_code, referred_by, stripe_customer_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("DATABASE_ERROR", error.message, 500, true);
  if (!profile) return fail("NOT_FOUND", "User not found", 404);

  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const au = authUser?.user;

  const [subs, audit, connected] = await Promise.all([
    admin.from("subscriptions").select("stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, created_at").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("audit_logs").select("id, action, actor_id, target_type, target_id, metadata, created_at").or(`user_id.eq.${id},target_id.eq.${id}`).order("created_at", { ascending: false }).limit(50),
    admin.from("connected_accounts").select("*").eq("user_id", id),
  ]);

  const usage = {
    aiRequests30d: await safeCount(admin, "ai_usage", id, 30 * DAY),
    productEvents30d: await safeCount(admin, "product_events", id, 30 * DAY),
    alerts: await safeCount(admin, "alert_rules", id),
    wallets: await safeCount(admin, "wallets", id),
    paperTrades: await safeCount(admin, "paper_trades", id),
  };

  await writeAudit(admin, { action: "admin.user_viewed", actorId: actor.id, userId: id, targetType: "user", targetId: id, req });

  return ok({
    profile,
    auth: au
      ? {
          createdAt: au.created_at,
          lastSignInAt: au.last_sign_in_at ?? null,
          emailConfirmedAt: au.email_confirmed_at ?? null,
          providers: (au.app_metadata?.providers as string[] | undefined) ?? [],
          bannedUntil: (au as { banned_until?: string | null }).banned_until ?? null,
        }
      : null,
    subscriptions: subs.data ?? [],
    usage,
    // connected account METADATA only (spec §135: never plaintext secrets)
    connectedAccounts: connected.error ? null : (connected.data ?? []).map((r) => redactSecrets(r as Record<string, unknown>)),
    audit: audit.data ?? [],
  });
}

const Patch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_plan"), plan: z.enum(["free", "pro", "proplus"]), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("suspend"), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("restore"), reason: z.string().min(3).max(300) }),
]);

/** Change plan (manual override), suspend or restore. Every action is audited with a reason. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return fail("VALIDATION_ERROR", "Invalid user id", 400);
  const b = await parseBody(req, Patch);
  if ("error" in b) return b.error;
  const { admin, user: actor } = g.ctx;
  if (id === actor.id && b.data.action !== "set_plan") return fail("FORBIDDEN", "You cannot suspend or restore your own account.", 403);

  const { data: before } = await admin.from("profiles").select("plan, status").eq("id", id).maybeSingle();
  if (!before) return fail("NOT_FOUND", "User not found", 404);

  if (b.data.action === "set_plan") {
    const { error } = await admin.from("profiles").update({ plan: b.data.plan }).eq("id", id);
    if (error) return fail("DATABASE_ERROR", error.message, 500, true);
    await writeAudit(admin, {
      action: "admin.plan_changed",
      actorId: actor.id,
      userId: id,
      targetType: "user",
      targetId: id,
      metadata: { from: before.plan, to: b.data.plan, reason: b.data.reason, note: "Manual override — the next Stripe webhook for this user recomputes the plan from Stripe." },
      req,
    });
    return ok({ updated: true });
  }

  const suspend = b.data.action === "suspend";
  const { error } = await admin.from("profiles").update({ status: suspend ? "suspended" : "active" }).eq("id", id);
  if (error) return fail("DATABASE_ERROR", error.message, 500, true);
  // Block/unblock sign-in at the auth layer too (ban_duration "none" lifts the ban).
  const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: suspend ? "876000h" : "none" });
  await writeAudit(admin, {
    action: suspend ? "admin.user_suspended" : "admin.user_restored",
    actorId: actor.id,
    userId: id,
    targetType: "user",
    targetId: id,
    metadata: { reason: b.data.reason, authBanApplied: !banErr, previousStatus: before.status },
    req,
  });
  return ok({ updated: true, authBanApplied: !banErr });
}
