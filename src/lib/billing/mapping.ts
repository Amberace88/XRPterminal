/**
 * Pure billing mapping helpers (no Stripe SDK, no server imports) — unit-tested in
 * tests/platform-billing.test.ts. Stripe is the billing source of truth (spec §136/§137);
 * these functions translate verified webhook payloads into our plan/status model.
 */
import type { PlanId } from "@/lib/entitlements";

export type PaidPlan = Exclude<PlanId, "free">;

/** Stripe subscription statuses (API "dahlia"). Unknown values are handled defensively. */
export type StripeSubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface PriceMap {
  pro: string;
  proplus: string;
}

/** Map a Stripe price id to our plan. Returns null for unknown prices (never guess). */
export function planForPriceId(priceId: string | null | undefined, prices: PriceMap): PaidPlan | null {
  if (!priceId) return null;
  if (prices.pro && priceId === prices.pro) return "pro";
  if (prices.proplus && priceId === prices.proplus) return "proplus";
  return null;
}

export function priceIdForPlan(plan: PaidPlan, prices: PriceMap): string | null {
  const id = plan === "pro" ? prices.pro : prices.proplus;
  return id || null;
}

/** Statuses that grant paid entitlements. `past_due` keeps access during Stripe's retry window. */
const ENTITLED: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export function isEntitledStatus(status: string | null | undefined): boolean {
  return !!status && ENTITLED.has(status);
}

/**
 * Effective plan written to `profiles.plan`.
 * Only an entitled status with a recognised price upgrades the user; everything else is free.
 */
export function effectivePlan(status: string | null | undefined, plan: PaidPlan | null): PlanId {
  if (!plan) return "free";
  return isEntitledStatus(status) ? plan : "free";
}

export interface SubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: number | null;
  trial_end?: number | null;
  start_date?: number | null;
  items?: { data: { price?: { id: string } | null; current_period_end?: number | null; current_period_start?: number | null }[] } | null;
}

export interface SubscriptionRecord {
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  plan: PaidPlan | null;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  trial_end: string | null;
  /** plan to store on the profile */
  profile_plan: PlanId;
  /** user id from subscription metadata (set by our checkout) */
  metadata_user_id: string | null;
}

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);

/** Convert a (verified) Stripe subscription object into our DB record. Pure. */
export function subscriptionToRecord(sub: SubscriptionLike, prices: PriceMap): SubscriptionRecord {
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const plan = planForPriceId(priceId, prices);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  // current_period_* moved to subscription items in recent Stripe API versions — use the max across items.
  const ends = (sub.items?.data ?? []).map((i) => i.current_period_end ?? 0).filter(Boolean);
  const starts = (sub.items?.data ?? []).map((i) => i.current_period_start ?? 0).filter(Boolean);
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    stripe_price_id: priceId,
    plan,
    status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_start: iso(starts.length ? Math.min(...starts) : null),
    current_period_end: iso(ends.length ? Math.max(...ends) : null),
    canceled_at: iso(sub.canceled_at),
    trial_end: iso(sub.trial_end),
    profile_plan: effectivePlan(sub.status, plan),
    metadata_user_id: sub.metadata?.user_id ?? null,
  };
}

/** Webhook events we act on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;
export type HandledEvent = (typeof HANDLED_EVENTS)[number];
export const isHandledEvent = (t: string): t is HandledEvent => (HANDLED_EVENTS as readonly string[]).includes(t);

/** Audit action name for a webhook-driven change (spec §143 "subscription changes"). */
export function auditActionFor(eventType: HandledEvent, before: PlanId | null, after: PlanId): string {
  if (eventType === "customer.subscription.deleted") return "subscription.cancelled";
  if (eventType === "invoice.payment_failed") return "subscription.payment_failed";
  if (before === null || before === "free") return after === "free" ? "subscription.updated" : "subscription.started";
  if (after === "free") return "subscription.ended";
  if (before !== after) return "subscription.plan_changed";
  return "subscription.renewed_or_updated";
}

/* ------------------------------------------------------------------ */
/* Revenue metrics (admin) — computed from Stripe subscription lists.  */

export interface RevenueSub {
  status: string;
  created: number; // unix seconds
  canceled_at?: number | null;
  ended_at?: number | null;
  trial_end?: number | null;
  items: { price: { id: string; unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number } | null }; quantity?: number | null }[];
}

export interface RevenueMetrics {
  currency: string | null;
  mixedCurrencies: boolean;
  mrr: number; // major units
  arr: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  newLast30d: number;
  cancelledLast30d: number;
  churnRate30d: number | null; // 0..1
  planDistribution: Record<string, number>;
}

/** Normalise a recurring price to a monthly amount in major currency units. */
export function monthlyAmount(unitAmountMinor: number, interval: string, intervalCount: number, quantity = 1): number {
  const perMonth: Record<string, number> = { day: 30.4375, week: 4.348125, month: 1, year: 1 / 12 };
  const factor = (perMonth[interval] ?? 0) / Math.max(1, intervalCount);
  return (unitAmountMinor / 100) * factor * quantity;
}

export function computeRevenueMetrics(subs: RevenueSub[], prices: PriceMap, nowSec = Math.floor(Date.now() / 1000)): RevenueMetrics {
  const THIRTY = 30 * 86400;
  const currencies = new Set<string>();
  let mrr = 0;
  let active = 0;
  let trialing = 0;
  let pastDue = 0;
  let newLast30d = 0;
  let cancelledLast30d = 0;
  const dist: Record<string, number> = {};
  for (const s of subs) {
    const counts = s.status === "active" || s.status === "past_due";
    if (s.status === "trialing") trialing++;
    if (s.status === "past_due") pastDue++;
    if (s.created >= nowSec - THIRTY && isEntitledStatus(s.status)) newLast30d++;
    const cancelledAt = s.canceled_at ?? s.ended_at ?? null;
    if (s.status === "canceled" && cancelledAt && cancelledAt >= nowSec - THIRTY) cancelledLast30d++;
    if (!counts) continue;
    active++;
    for (const it of s.items) {
      const p = it.price;
      if (!p.recurring || p.unit_amount == null) continue;
      currencies.add(p.currency.toUpperCase());
      mrr += monthlyAmount(p.unit_amount, p.recurring.interval, p.recurring.interval_count, it.quantity ?? 1);
      const plan = planForPriceId(p.id, prices) ?? "other";
      dist[plan] = (dist[plan] ?? 0) + 1;
    }
  }
  const base = active + cancelledLast30d;
  return {
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixedCurrencies: currencies.size > 1,
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    activeSubscriptions: active,
    trialing,
    pastDue,
    newLast30d,
    cancelledLast30d,
    churnRate30d: base > 0 ? cancelledLast30d / base : null,
    planDistribution: dist,
  };
}
