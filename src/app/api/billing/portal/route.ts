import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, limitOr429, log, ok } from "@/lib/server/api";
import { getStripe, originOf } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/** Stripe Customer Portal: manage payment method, change plan, cancel, invoices. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "billing-portal", 10, 60_000);
  if (limited) return limited;
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe || !admin) return fail("BILLING_NOT_CONFIGURED", "Billing is not yet enabled on this deployment.", 503);
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", "Sign in to manage billing.", 401);

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  const customer = profile?.stripe_customer_id as string | null | undefined;
  if (!customer) return fail("NO_BILLING_ACCOUNT", "You don't have a billing account yet. Choose a plan first.", 404);
  try {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${originOf(req)}/settings#billing` });
    return ok({ url: session.url });
  } catch (e) {
    log("error", "portal session failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("PORTAL_FAILED", "Could not open the billing portal. Please try again.", 502, true);
  }
}
