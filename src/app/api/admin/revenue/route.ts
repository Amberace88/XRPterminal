import { requireAdmin } from "@/lib/admin/server";
import { fail, log, ok } from "@/lib/server/api";
import { getStripe, stripePrices } from "@/lib/billing/stripe";
import { computeRevenueMetrics, type RevenueSub } from "@/lib/billing/mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Revenue metrics straight from Stripe — the billing source of truth (spec §136). */
let cache: { at: number; body: unknown } | null = null;
const TTL = 5 * 60_000;
const MAX = 5000;

export async function GET(req: Request) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const stripe = getStripe();
  if (!stripe) return ok({ configured: false });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL) return ok(cache.body);

  try {
    const list = await stripe.subscriptions.list({ status: "all", limit: 100 }).autoPagingToArray({ limit: MAX });
    const subs: RevenueSub[] = list.map((s) => ({
      status: s.status,
      created: s.created,
      canceled_at: s.canceled_at,
      ended_at: s.ended_at,
      trial_end: s.trial_end,
      items: s.items.data.map((i) => ({
        quantity: i.quantity ?? 1,
        price: {
          id: i.price.id,
          unit_amount: i.price.unit_amount,
          currency: i.price.currency,
          recurring: i.price.recurring ? { interval: i.price.recurring.interval, interval_count: i.price.recurring.interval_count } : null,
        },
      })),
    }));
    const metrics = computeRevenueMetrics(subs, stripePrices());
    // Trial conversion: trials that started in the last 90d and are now active.
    const trialsStarted = list.filter((s) => s.trial_start && s.trial_start * 1000 > Date.now() - 90 * 86_400_000);
    const trialsConverted = trialsStarted.filter((s) => s.status === "active").length;
    const body = {
      configured: true,
      metrics,
      trialConversion90d: trialsStarted.length ? { started: trialsStarted.length, converted: trialsConverted } : null,
      scanned: list.length,
      truncated: list.length >= MAX,
      livemode: list[0]?.livemode ?? null,
      computedAt: new Date().toISOString(),
      methodology:
        "MRR = sum of active and past-due recurring prices normalised to one month (yearly ÷ 12). Churn (30d) = subscriptions cancelled in the last 30 days ÷ (active + those cancelled). Trials are excluded from MRR.",
    };
    cache = { at: Date.now(), body };
    return ok(body);
  } catch (e) {
    log("error", "stripe revenue fetch failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("STRIPE_ERROR", "Could not load data from Stripe.", 502, true);
  }
}
