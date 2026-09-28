import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { writeAudit } from "@/lib/admin/server";
import { getStripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

const Body = z.object({ confirm: z.literal("DELETE") });

/**
 * Account deletion (spec §194). Steps:
 *  1. audit + GDPR request record (retained, anonymised — user_id becomes NULL on delete)
 *  2. cancel any active Stripe subscriptions immediately (no further charges)
 *  3. anonymise the profile, then delete the auth user → cascades to every user-owned table
 * Invoices remain in Stripe where retention is legally required (accounting law).
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "user-delete", 3, 10 * 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;

  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", "Sign in to delete your account.", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return fail("SERVICE_ROLE_MISSING", "Account deletion is temporarily unavailable. Contact support.", 503);

  const emailHash = user.email ? createHash("sha256").update(user.email.toLowerCase()).digest("hex") : null;
  const { data: gdpr } = await admin
    .from("gdpr_requests")
    .insert({ user_id: user.id, email_hash: emailHash, kind: "delete", status: "processing" })
    .select("id")
    .maybeSingle();
  await writeAudit(admin, { action: "account.deletion_requested", actorId: user.id, userId: user.id, req });

  // Cancel subscriptions so the user is not charged again.
  const stripe = getStripe();
  if (stripe) {
    const { data: subs } = await admin.from("subscriptions").select("stripe_subscription_id, status").eq("user_id", user.id);
    for (const s of subs ?? []) {
      if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status as string)) {
        try {
          await stripe.subscriptions.cancel(s.stripe_subscription_id as string);
        } catch (e) {
          log("error", "subscription cancel on deletion failed", { error: e instanceof Error ? e.message : String(e) });
          return fail("BILLING_CANCEL_FAILED", "We could not cancel your subscription automatically. Cancel it in Billing first, then retry.", 502, true);
        }
      }
    }
  }

  // Anonymise first (defence in depth in case the auth delete partially fails).
  await admin
    .from("profiles")
    .update({ email: null, display_name: null, avatar_url: null, status: "deleted", preferences: {}, social_visibility: "private" })
    .eq("id", user.id);

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    log("error", "auth user delete failed", { error: delErr.message });
    return fail("DELETE_FAILED", "Deletion could not be completed. Your profile was anonymised; please contact support.", 500, true);
  }

  if (gdpr?.id) {
    await admin.from("gdpr_requests").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", gdpr.id);
  }
  // user_id no longer exists; record the completion without personal data
  await writeAudit(admin, { action: "account.deleted", metadata: { gdprRequestId: gdpr?.id ?? null } });
  return ok({ deleted: true });
}
