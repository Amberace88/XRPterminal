/**
 * Central entitlement engine (spec §138). Plan logic lives ONLY here.
 * Server routes must call these with the plan read from the database
 * (populated by verified Stripe webhooks) — never from a client claim.
 */

export type PlanId = "free" | "pro" | "proplus";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceEurMonthly: number;
  tagline: string;
  limits: {
    connectedAccounts: number; // Infinity = unlimited
    alerts: number;
    watchlistItems: number;
    paperAccounts: number;
    aiRequestsPerDay: number;
    claimChecksPerDay: number;
    backtestsPerDay: number;
  };
  features: {
    advancedForecast: boolean;
    longHorizonForecast: boolean;
    advancedTradeLab: boolean;
    strategyLab: boolean;
    historicalReplay: boolean;
    advancedAlerts: boolean;
    smartAlerts: boolean;
    entityGraph: boolean;
    reports: boolean;
    exchangeConnections: boolean;
  };
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceEurMonthly: 0,
    tagline: "Real data, no card required.",
    limits: {
      connectedAccounts: 1,
      alerts: 5,
      watchlistItems: 15,
      paperAccounts: 1,
      aiRequestsPerDay: 5,
      claimChecksPerDay: 2,
      backtestsPerDay: 5,
    },
    features: {
      advancedForecast: false,
      longHorizonForecast: false,
      advancedTradeLab: false,
      strategyLab: true,
      historicalReplay: true,
      advancedAlerts: false,
      smartAlerts: false,
      entityGraph: false,
      reports: false,
      exchangeConnections: false,
    },
    highlights: [
      "Live XRP market data & charts",
      "Public XRPL explorer & wallet lookup",
      "Historical statistics & drawdowns",
      "Future scenarios (7D–90D)",
      "Trade Lab with $100k virtual capital",
      "1 connected wallet · 5 alerts",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceEurMonthly: 9.99,
    tagline: "For active XRP market participants.",
    limits: {
      connectedAccounts: 5,
      alerts: 50,
      watchlistItems: 100,
      paperAccounts: 5,
      aiRequestsPerDay: 60,
      claimChecksPerDay: 20,
      backtestsPerDay: 100,
    },
    features: {
      advancedForecast: true,
      longHorizonForecast: true,
      advancedTradeLab: true,
      strategyLab: true,
      historicalReplay: true,
      advancedAlerts: true,
      smartAlerts: false,
      entityGraph: true,
      reports: true,
      exchangeConnections: true,
    },
    highlights: [
      "Everything in Free",
      "Up to 5 connected accounts",
      "Forecast horizons up to 1Y + walk-forward stats",
      "AI briefs & Claim Check (higher limits)",
      "Advanced Trade Lab, replay & strategy lab",
      "50 alerts · entity graph · reports",
    ],
  },
  proplus: {
    id: "proplus",
    name: "Pro+",
    priceEurMonthly: 19.99,
    tagline: "Research-grade depth, no limits on accounts.",
    limits: {
      connectedAccounts: Number.POSITIVE_INFINITY,
      alerts: 250,
      watchlistItems: 500,
      paperAccounts: 20,
      aiRequestsPerDay: 250,
      claimChecksPerDay: 100,
      backtestsPerDay: 1000,
    },
    features: {
      advancedForecast: true,
      longHorizonForecast: true,
      advancedTradeLab: true,
      strategyLab: true,
      historicalReplay: true,
      advancedAlerts: true,
      smartAlerts: true,
      entityGraph: true,
      reports: true,
      exchangeConnections: true,
    },
    highlights: [
      "Everything in Pro",
      "Unlimited connected accounts",
      "Smart multi-condition alerts",
      "Highest AI & research limits",
      "Premium reports",
      "Priority access to new models",
    ],
  },
};

export function planOf(plan: string | null | undefined): PlanDefinition {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "free"];
}

export const canAddConnectedAccount = (plan: string | null | undefined, current: number) =>
  current < planOf(plan).limits.connectedAccounts;
export const canCreateAlert = (plan: string | null | undefined, current: number) => current < planOf(plan).limits.alerts;
export const canUseAdvancedForecast = (plan: string | null | undefined) => planOf(plan).features.advancedForecast;
export const canUseLongHorizon = (plan: string | null | undefined) => planOf(plan).features.longHorizonForecast;
export const canUseAdvancedTradeLab = (plan: string | null | undefined) => planOf(plan).features.advancedTradeLab;
export const canUseAdvancedAlerts = (plan: string | null | undefined) => planOf(plan).features.advancedAlerts;
export const canUseSmartAlerts = (plan: string | null | undefined) => planOf(plan).features.smartAlerts;
export const canUseEntityGraph = (plan: string | null | undefined) => planOf(plan).features.entityGraph;
export const canConnectExchange = (plan: string | null | undefined) => planOf(plan).features.exchangeConnections;
export const aiDailyLimit = (plan: string | null | undefined) => planOf(plan).limits.aiRequestsPerDay;
