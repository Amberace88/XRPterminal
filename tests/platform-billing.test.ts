import { describe, expect, it } from "vitest";
import {
  auditActionFor,
  computeRevenueMetrics,
  effectivePlan,
  isHandledEvent,
  monthlyAmount,
  planForPriceId,
  priceIdForPlan,
  subscriptionToRecord,
  type RevenueSub,
} from "@/lib/billing/mapping";

const PRICES = { pro: "price_pro", proplus: "price_proplus" };

describe("webhook plan mapping", () => {
  it("maps known price ids and rejects unknown ones", () => {
    expect(planForPriceId("price_pro", PRICES)).toBe("pro");
    expect(planForPriceId("price_proplus", PRICES)).toBe("proplus");
    expect(planForPriceId("price_other", PRICES)).toBeNull();
    expect(planForPriceId(null, PRICES)).toBeNull();
    expect(planForPriceId("", { pro: "", proplus: "" })).toBeNull();
    expect(priceIdForPlan("pro", PRICES)).toBe("price_pro");
    expect(priceIdForPlan("proplus", { pro: "x", proplus: "" })).toBeNull();
  });

  it("only entitled statuses grant a paid plan", () => {
    expect(effectivePlan("active", "pro")).toBe("pro");
    expect(effectivePlan("trialing", "proplus")).toBe("proplus");
    expect(effectivePlan("past_due", "pro")).toBe("pro");
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "weird"]) expect(effectivePlan(s, "pro")).toBe("free");
    expect(effectivePlan("active", null)).toBe("free");
  });

  it("converts a subscription object into a DB record", () => {
    const rec = subscriptionToRecord(
      {
        id: "sub_1",
        status: "active",
        customer: { id: "cus_1" },
        metadata: { user_id: "u1" },
        cancel_at_period_end: true,
        canceled_at: null,
        trial_end: null,
        items: { data: [{ price: { id: "price_proplus" }, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] },
      },
      PRICES,
    );
    expect(rec).toMatchObject({
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      stripe_price_id: "price_proplus",
      plan: "proplus",
      profile_plan: "proplus",
      cancel_at_period_end: true,
      metadata_user_id: "u1",
    });
    expect(rec.current_period_end).toBe(new Date(1_702_592_000 * 1000).toISOString());
  });

  it("a deleted subscription downgrades to free", () => {
    const rec = subscriptionToRecord({ id: "sub_2", status: "canceled", customer: "cus_2", items: { data: [{ price: { id: "price_pro" } }] } }, PRICES);
    expect(rec.plan).toBe("pro");
    expect(rec.profile_plan).toBe("free");
  });

  it("handled events and audit actions", () => {
    expect(isHandledEvent("checkout.session.completed")).toBe(true);
    expect(isHandledEvent("invoice.paid")).toBe(false);
    expect(auditActionFor("customer.subscription.created", "free", "pro")).toBe("subscription.started");
    expect(auditActionFor("customer.subscription.updated", "pro", "proplus")).toBe("subscription.plan_changed");
    expect(auditActionFor("customer.subscription.updated", "pro", "free")).toBe("subscription.ended");
    expect(auditActionFor("customer.subscription.deleted", "pro", "free")).toBe("subscription.cancelled");
    expect(auditActionFor("invoice.payment_failed", "pro", "pro")).toBe("subscription.payment_failed");
  });
});

describe("revenue metrics", () => {
  const now = 1_760_000_000;
  const sub = (status: string, price: string, amount: number, interval = "month", created = now - 100 * 86400, canceled_at: number | null = null): RevenueSub => ({
    status,
    created,
    canceled_at,
    items: [{ price: { id: price, unit_amount: amount, currency: "eur", recurring: { interval, interval_count: 1 } }, quantity: 1 }],
  });

  it("normalises intervals to monthly", () => {
    expect(monthlyAmount(999, "month", 1)).toBeCloseTo(9.99);
    expect(monthlyAmount(12000, "year", 1)).toBeCloseTo(10);
    expect(monthlyAmount(999, "month", 3)).toBeCloseTo(3.33, 2);
  });

  it("computes MRR, ARR, churn and distribution from real subscriptions only", () => {
    const m = computeRevenueMetrics(
      [
        sub("active", "price_pro", 999),
        sub("active", "price_proplus", 1999),
        sub("past_due", "price_pro", 999),
        sub("trialing", "price_pro", 999, "month", now - 2 * 86400),
        sub("canceled", "price_pro", 999, "month", now - 200 * 86400, now - 5 * 86400),
      ],
      PRICES,
      now,
    );
    expect(m.mrr).toBeCloseTo(39.97, 2);
    expect(m.arr).toBeCloseTo(479.64, 2);
    expect(m.activeSubscriptions).toBe(3);
    expect(m.trialing).toBe(1);
    expect(m.cancelledLast30d).toBe(1);
    expect(m.churnRate30d).toBeCloseTo(0.25);
    expect(m.newLast30d).toBe(1);
    expect(m.planDistribution).toEqual({ pro: 2, proplus: 1 });
    expect(m.currency).toBe("EUR");
  });

  it("empty input gives zeroes and no churn rate", () => {
    const m = computeRevenueMetrics([], PRICES, now);
    expect(m.mrr).toBe(0);
    expect(m.churnRate30d).toBeNull();
    expect(m.currency).toBeNull();
  });
});
