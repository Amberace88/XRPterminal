import "server-only";

/** Server-only secrets. Never import this file from client components. */
export function serverEnv() {
  return {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    stripePricePro: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
    stripePriceProPlus: process.env.STRIPE_PRICE_PROPLUS_MONTHLY || "",
    credentialsKey: process.env.CREDENTIALS_ENCRYPTION_KEY || "",
    cronSecret: process.env.CRON_SECRET || "",
    cryptocompareKey: process.env.CRYPTOCOMPARE_API_KEY || "",
  };
}

export const isAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const isServiceRoleConfigured = () =>
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
