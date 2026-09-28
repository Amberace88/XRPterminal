import type { DictKey } from "@/lib/i18n/dictionaries";

export interface NavItem {
  href: string;
  key: DictKey;
  icon: string; // lucide icon name, resolved in Nav component
  group: "main" | "secondary" | "admin";
  mobilePrimary?: boolean;
  description: string;
  badge?: "BETA";
}

/** Final product navigation (spec §340, §246, §247). */
export const NAV: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: "LayoutDashboard", group: "main", mobilePrimary: true, description: "Command center" },
  { href: "/market", key: "nav.market", icon: "CandlestickChart", group: "main", mobilePrimary: true, description: "Live prices, charts, order book" },
  { href: "/xrpl", key: "nav.xrpl", icon: "Network", group: "main", mobilePrimary: true, description: "XRP Ledger explorer, whales, activity" },
  { href: "/portfolio", key: "nav.portfolio", icon: "Wallet", group: "main", mobilePrimary: true, description: "Wallets, holdings, P&L" },
  { href: "/historical", key: "nav.historical", icon: "History", group: "main", description: "Cycles, drawdowns, seasonality" },
  { href: "/future", key: "nav.future", icon: "Telescope", group: "main", description: "Scenario ranges & forecast history" },
  { href: "/ai", key: "nav.ai", icon: "Sparkles", group: "main", description: "AI briefs & research" },
  { href: "/news", key: "nav.news", icon: "Newspaper", group: "main", description: "News & Claim Check" },
  { href: "/social", key: "nav.social", icon: "Users", group: "main", description: "Verified traders & sentiment", badge: "BETA" },
  { href: "/trade-lab", key: "nav.tradelab", icon: "FlaskConical", group: "main", mobilePrimary: true, description: "Paper trading (simulated)" },
  { href: "/alerts", key: "nav.alerts", icon: "BellRing", group: "secondary", description: "Price, wallet & regime alerts" },
  { href: "/calculators", key: "nav.calculators", icon: "Calculator", group: "secondary", description: "P&L, DCA, sizing, scenarios" },
  { href: "/research", key: "nav.research", icon: "BookOpenText", group: "secondary", description: "Research hub" },
  { href: "/academy", key: "nav.academy", icon: "GraduationCap", group: "secondary", description: "Trading & XRPL academy" },
  { href: "/settings", key: "nav.settings", icon: "Settings", group: "secondary", description: "Account & preferences" },
  { href: "/admin", key: "nav.admin", icon: "ShieldCheck", group: "admin", description: "Administration" },
];

/** Extra command-palette destinations (sub-pages). */
export const EXTRA_DESTINATIONS: { href: string; label: string; section: string }[] = [
  { href: "/trade-lab", label: "Trade Lab — Terminal", section: "Trade Lab" },
  { href: "/trade-lab/performance", label: "Trade Lab — Performance", section: "Trade Lab" },
  { href: "/trade-lab/journal", label: "Trade Lab — Journal", section: "Trade Lab" },
  { href: "/trade-lab/replay", label: "Trade Lab — Historical Replay", section: "Trade Lab" },
  { href: "/trade-lab/strategy", label: "Trade Lab — Strategy Lab", section: "Trade Lab" },
  { href: "/trade-lab/challenges", label: "Trade Lab — Challenges", section: "Trade Lab" },
  { href: "/xrpl/whales", label: "XRPL — Whale transactions (live)", section: "XRPL" },
  { href: "/xrpl/activity", label: "XRPL — Network activity", section: "XRPL" },
  { href: "/xrpl/graph", label: "XRPL — Entity graph", section: "XRPL" },
  { href: "/news/claim-check", label: "Claim Check", section: "News" },
  { href: "/calculators#position-size", label: "Position size calculator", section: "Calculators" },
  { href: "/calculators#dca", label: "DCA calculator", section: "Calculators" },
  { href: "/calculators#scenario", label: "Scenario calculator", section: "Calculators" },
  { href: "/pricing", label: "Pricing", section: "Account" },
  { href: "/legal/risk", label: "Risk disclosure", section: "Legal" },
  { href: "/legal/terms", label: "Terms of Service", section: "Legal" },
  { href: "/legal/privacy", label: "Privacy Policy", section: "Legal" },
];
