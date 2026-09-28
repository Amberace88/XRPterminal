import "server-only";
import Stripe from "stripe";
import { serverEnv, isStripeConfigured } from "@/lib/server/env";
import { isSupabaseConfigured } from "@/lib/config";
import type { PriceMap } from "./mapping";

/**
 * Server-only Stripe access. The secret key never reaches the browser.
 * Returns null when Stripe is not configured so callers can show a transparent
 * "Billing not yet enabled" state instead of failing.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!isStripeConfigured()) return null;
  if (!client) {
    client = new Stripe(serverEnv().stripeSecretKey, {
      appInfo: { name: "XRP Terminal", url: "https://xrpterminal.com" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return client;
}

export function stripePrices(): PriceMap {
  const env = serverEnv();
  return { pro: env.stripePricePro, proplus: env.stripePriceProPlus };
}

/**
 * Checkout needs: Stripe secret + both price ids + Supabase (to know who is paying
 * and to persist entitlements from webhooks).
 */
export function isCheckoutEnabled(): boolean {
  const p = stripePrices();
  return isStripeConfigured() && isSupabaseConfigured() && Boolean(p.pro && p.proplus);
}

export function isWebhookConfigured(): boolean {
  return isStripeConfigured() && Boolean(serverEnv().stripeWebhookSecret);
}

/** Absolute origin for redirect URLs. Prefers the request origin, falls back to SITE url. */
export function originOf(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const u = new URL(req.url);
    // Behind Netlify the request URL is the public URL; fall back to configured site otherwise.
    if (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") return u.origin;
  } catch {
    /* ignore */
  }
  return env || "https://xrpterminal.com";
}
