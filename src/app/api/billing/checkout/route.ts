import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { getStripe, isCheckoutEnabled, originOf, stripePrices } from "@/lib/billing/stripe";
import { isEntitledStatus, priceIdForPlan } from "@/lib/billing/mapping";
import { writeAudit } from "@/lib/admin/server";

export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["pro", "proplus"]) });

/**
 * Creates a Stripe Checkout subscription session for the signed-in user.
 * The plan is only a request — entitlements change exclusively through the verified webhook.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "billing-checkout", 10, 60_000);
  if (limited) return limited;
  if (!isCheckoutEnabled()) return fail("BILLING_NOT_CONFIGURED", "Billing is not yet enabled on this deployment.", 503);

  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;

  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", "Sign in to subscribe.", 401);
  const admin = getSupabaseAdmin();
  const stripe = getStripe();
  if (!admin || !stripe) return fail("BILLING_NOT_CONFIGURED", "Billing is not yet enabled on this deployment.", 503);

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("email, stripe_customer_id, plan, subscription_status, status")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr || !profile) return fail("PROFILE_NOT_FOUND", "Your profile could not be loaded.", 404);
  if (profile.status !== "active") return fail("ACCOUNT_SUSPENDED", "This account cannot start a subscription.", 403);

  const price = priceIdForPlan(b.data.plan, stripePrices());
  if (!price) return fail("BILLING_NOT_CONFIGURED", "This plan is not available yet.", 503);
  const origin = originOf(req);

  try {
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email ?? (profile.email as string | undefined) ?? undefined, metadata: { user_id: user.id } },
        { idempotencyKey: `xrpt-customer-${user.id}` },
      );
      customerId = customer.id;
      const { error } = await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      if (error) log("error", "failed to store stripe_customer_id", { error: error.message });
    }

    // Existing paid subscribers change plans in the Customer Portal (avoids double subscriptions).
    if (profile.plan !== "free" && isEntitledStatus(profile.subscription_status as string | null)) {
      const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/settings#billing` });
      return ok({ url: portal.url, mode: "portal" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      subscription_data: { metadata: { user_id: user.id, plan: b.data.plan } },
      metadata: { user_id: user.id, plan: b.data.plan },
      success_url: `${origin}/settings?billing=success#billing`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    });
    await writeAudit(admin, { action: "billing.checkout_started", actorId: user.id, userId: user.id, targetType: "plan", targetId: b.data.plan, req });
    if (!session.url) return fail("CHECKOUT_FAILED", "Stripe did not return a checkout URL.", 502, true);
    return ok({ url: session.url, mode: "checkout" });
  } catch (e) {
    log("error", "checkout session failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("CHECKOUT_FAILED", "Could not start checkout. Please try again.", 502, true);
  }
}
