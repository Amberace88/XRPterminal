/**
 * Central feature/integration configuration. Server-only secrets are read in
 * server modules via `serverEnv()`; this file only exposes booleans and public values.
 */

export const SITE = {
  name: "XRP Terminal",
  domain: "xrpterminal.com",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://xrpterminal.com",
  tagline: "See beyond the price.",
  description:
    "Independent XRP & XRP Ledger intelligence: live market data, XRPL explorer, wallet intelligence, historical analytics, scenario ranges and a fully simulated Trade Lab.",
} as const;

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

/** Feature flags (spec §241). BETA features are labelled in the UI. */
export const FEATURE_FLAGS = {
  exchangeConnections: { enabled: true, status: "BETA" as const },
  entityGraph: { enabled: true, status: "BETA" as const },
  socialIntelligence: { enabled: true, status: "BETA" as const },
  strategyLab: { enabled: true, status: "LIVE" as const },
  liveTradingBridge: { enabled: false, status: "DISABLED" as const }, // spec §122 / §294 — never enabled in MVP
  experimentalForecasts: { enabled: false, status: "PLANNED" as const },
};

export const LEGAL_DISCLAIMER =
  "XRP Terminal is an independent software and analytics platform. It does not hold, custody, buy, sell, transfer or execute transactions in crypto-assets on behalf of users. Information, analytics, historical statistics, scenarios and model outputs provided by XRP Terminal are for informational and analytical purposes only. They do not constitute personalized investment advice, portfolio management, a recommendation to buy or sell any crypto-asset, or a guarantee of future performance. Historical results do not guarantee future results. Crypto-assets are volatile and users may lose some or all of their invested capital.";

export const INDEPENDENCE_STATEMENT =
  "XRP Terminal is an independent software and analytics platform and is not affiliated with, endorsed by, or sponsored by Ripple Labs Inc.";

export const PAPER_DISCLAIMER =
  "Past simulated performance does not guarantee future results. Paper trading does not reproduce every condition of live markets.";
