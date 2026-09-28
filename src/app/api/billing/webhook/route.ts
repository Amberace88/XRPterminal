import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, log, ok } from "@/lib/server/api";
import { serverEnv } from "@/lib/server/env";
import { getStripe, isWebhookConfigured, stripePrices } from "@/lib/billing/stripe";
import {
  auditActionFor,
  isEntitledStatus,
  isHandledEvent,
  subscriptionToRecord,
  type HandledEvent,
  type SubscriptionLike,
} from "@/lib/billing/mapping";
import type { PlanId } from "@/lib/entitlements";
import { writeAudit } from "@/lib/admin/server";
import { recordErrorEvent } from "@/lib/admin/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook (spec §137). Signature verified against the RAW body; events are
 * processed idempotently (stripe_events table). Browser-side plan claims are never trusted —
 * this route is the only writer of subscriptions / profiles.plan.
 */
export async function POST(req: Request) {
  if (!isWebhookConfigured()) return fail("BILLING_NOT_CONFIGURED", "Webhook not configured", 503);
  const stripe = getStripe()!;
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("MISSING_SIGNATURE", "Missing Stripe-Signature header", 400);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, serverEnv().stripeWebhookSecret);
  } catch (e) {
    log("warn", "stripe signature verification failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("INVALID_SIGNATURE", "Signature verification failed", 400);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return fail("DATABASE_NOT_CONFIGURED", "Service role not configured", 503, true); // Stripe retries

  // Idempotency: first insert wins. A row without processed_at means a previous attempt failed → retry it.
  const { error: insErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (insErr) {
    if (insErr.code === "23505") {
      const { data: prev } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
      if (prev?.processed_at) return ok({ received: true, duplicate: true });
    } else {
      log("error", "stripe_events insert failed", { error: insErr.message });
      return fail("DATABASE_ERROR", "Could not record event", 500, true);
    }
  }

  if (!isHandledEvent(event.type)) {
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return ok({ received: true, ignored: true });
  }

  try {
    await handleEvent(stripe, admin, event, event.type as HandledEvent);
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return ok({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("stripe_events").update({ error: message.slice(0, 500) }).eq("id", event.id);
    await recordErrorEvent("webhook", `Stripe ${event.type}: ${message}`, { metadata: { eventId: event.id } });
    return fail("WEBHOOK_PROCESSING_FAILED", "Processing failed; Stripe will retry", 500, true);
  }
}

async function handleEvent(stripe: Stripe, admin: SupabaseClient, event: Stripe.Event, type: HandledEvent) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = session.client_reference_id || session.metadata?.user_id || null;
      await syncSubscription(admin, sub as unknown as SubscriptionLike, userId, type, event.id);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(admin, event.data.object as unknown as SubscriptionLike, null, type, event.id);
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const ref = invoice.parent?.subscription_details?.subscription;
      if (!ref) return;
      const sub = await stripe.subscriptions.retrieve(typeof ref === "string" ? ref : ref.id);
      const userId = await syncSubscription(admin, sub as unknown as SubscriptionLike, null, type, event.id);
      if (userId) {
        await admin.from("notifications").upsert(
          {
            user_id: userId,
            category: "billing",
            title: "Payment failed",
            body: "Your latest subscription payment failed. Update your payment method in Settings → Billing to keep your plan.",
            href: "/settings#billing",
            priority: "critical",
            dedupe_key: `payment_failed:${invoice.id}`,
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
      }
      return;
    }
    default:
      return;
  }
}

const RANK: Record<PlanId, number> = { free: 0, pro: 1, proplus: 2 };

/** Upsert the subscription row and recompute the profile plan from ALL of the user's subscriptions. */
async function syncSubscription(
  admin: SupabaseClient,
  sub: SubscriptionLike,
  userIdHint: string | null,
  type: HandledEvent,
  eventId: string,
): Promise<string | null> {
  const rec = subscriptionToRecord(sub, stripePrices());
  let userId = userIdHint || rec.metadata_user_id;
  if (!userId && rec.stripe_customer_id) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", rec.stripe_customer_id).maybeSingle();
    userId = (data?.id as string | undefined) ?? null;
  }
  if (!userId) {
    // Not ours (or created outside our checkout) — acknowledge, but surface for review.
    await recordErrorEvent("webhook", `Unmapped Stripe subscription ${rec.stripe_subscription_id}`, { metadata: { eventId } });
    return null;
  }

  const { data: before } = await admin.from("profiles").select("plan, referred_by, stripe_customer_id").eq("id", userId).maybeSingle();
  if (!before) throw new Error(`profile ${userId} not found`);

  const { profile_plan: _pp, metadata_user_id: _mu, ...row } = rec;
  void _pp;
  void _mu;
  const { error: upErr } = await admin.from("subscriptions").upsert({ ...row, user_id: userId }, { onConflict: "stripe_subscription_id" });
  if (upErr) throw new Error(`subscriptions upsert: ${upErr.message}`);

  // A user could briefly hold two subscriptions (e.g. during an upgrade) — grant the highest entitled plan.
  const { data: subs } = await admin.from("subscriptions").select("plan, status").eq("user_id", userId);
  let best: PlanId = "free";
  let bestStatus: string | null = rec.status;
  for (const s of subs ?? []) {
    const plan = (s.plan as PlanId | null) ?? null;
    if (plan && isEntitledStatus(s.status as string) && RANK[plan] > RANK[best]) {
      best = plan;
      bestStatus = s.status as string;
    }
  }

  const patch: Record<string, unknown> = { plan: best, subscription_status: best === "free" ? rec.status : bestStatus };
  if (!before.stripe_customer_id && rec.stripe_customer_id) patch.stripe_customer_id = rec.stripe_customer_id;
  const { error: pErr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (pErr) throw new Error(`profile update: ${pErr.message}`);

  const prevPlan = (before.plan as PlanId | null) ?? "free";
  await writeAudit(admin, {
    action: auditActionFor(type, prevPlan, best),
    userId,
    targetType: "subscription",
    targetId: rec.stripe_subscription_id,
    metadata: { event: type, eventId, status: rec.status, plan: rec.plan, from: prevPlan, to: best, cancelAtPeriodEnd: rec.cancel_at_period_end },
  });

  if (prevPlan === "free" && best !== "free") {
    await admin.from("product_events").insert({ user_id: userId, name: "subscription_started", props: { plan: best } });
    // Paid referral conversion (never fabricated: only from a verified Stripe event)
    if (before.referred_by) {
      const item = sub.items?.data?.[0] as { price?: { unit_amount?: number | null; currency?: string } } | undefined;
      await admin.from("referral_conversions").upsert(
        {
          referral_code: before.referred_by,
          referred_user_id: userId,
          event: "paid",
          amount: item?.price?.unit_amount != null ? item.price.unit_amount / 100 : null,
          currency: item?.price?.currency?.toUpperCase() ?? null,
          stripe_reference: rec.stripe_subscription_id,
        },
        { onConflict: "referred_user_id,event", ignoreDuplicates: true },
      );
    }
  } else if (prevPlan !== "free" && best === "free") {
    await admin.from("product_events").insert({ user_id: userId, name: "subscription_cancelled", props: { plan: prevPlan } });
    await admin.from("notifications").upsert(
      {
        user_id: userId,
        category: "billing",
        title: "Subscription ended",
        body: "Your paid plan has ended and your account is now on the Free plan. Your data is kept.",
        href: "/pricing",
        priority: "normal",
        dedupe_key: `sub_ended:${rec.stripe_subscription_id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  }
  return userId;
}
