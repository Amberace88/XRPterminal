/**
 * Marketing copy, kept in one module so it can be translated later (spec §172) and
 * reviewed in one place. Every statement must be true of the shipped product.
 */
import type { VisualId } from "./visuals";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@xrpterminal.com";
export const LEGAL_LAST_UPDATED = "28 September 2026";

export const MARKETING_NAV = [
  { href: "/#product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/academy", label: "Academy" },
  { href: "/security", label: "Security" },
] as const;

export interface FeatureSection {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  visual: VisualId;
  badge?: "BETA" | "SIMULATED";
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "market",
    eyebrow: "Market intelligence",
    title: "Every price, with its source and its age.",
    body: "Live XRP prices from several major exchanges with automatic provider failover. Each number shows where it came from and how fresh it is — so an old quote is never mistaken for the current market.",
    points: [
      "Candles from 1 minute to monthly, aligned to UTC",
      "Deterministic market regime and risk engine — with the reasoning shown",
      "USD, EUR and GBP display using ECB reference FX rates",
      "Data-quality checks flag gaps and outliers instead of hiding them",
    ],
    href: "/market",
    cta: "Open Market",
    visual: "market",
  },
  {
    id: "xrpl",
    eyebrow: "XRPL intelligence",
    title: "Read the ledger itself.",
    body: "XRP Terminal connects directly to public XRP Ledger servers. Search any address, transaction or ledger, watch validated ledgers close, and follow large transfers as they happen — with labels that show their provenance.",
    points: [
      "Explorer for accounts, transactions and ledgers",
      "Whale transfer stream and network activity",
      "Wallet profiler with sourced, confidence-rated labels",
      "Entity graph for relationships between accounts (beta)",
    ],
    href: "/xrpl",
    cta: "Open XRPL Explorer",
    visual: "xrpl",
  },
  {
    id: "portfolio",
    eyebrow: "Portfolio",
    title: "Your holdings. Read-only by design.",
    body: "Track public XRPL addresses and read-only exchange connections in one place. Cost basis, profit and loss and allocation are calculated deterministically — and nothing here can move your funds.",
    points: [
      "Public XRPL addresses — no keys, no signing, no custody",
      "Read-only exchange API connections, encrypted at rest (beta)",
      "Cost basis with realised and unrealised P&L",
      "Guest mode keeps your data in this browser only",
    ],
    href: "/portfolio",
    cta: "Open Portfolio",
    visual: "portfolio",
  },
  {
    id: "ai",
    eyebrow: "AI intelligence",
    title: "AI that explains — and never invents.",
    body: "Briefs, research answers and Claim Check separate FACT, ANALYSIS, SCENARIO and SPECULATION. Numbers come from deterministic code; the model explains them and cites sources you can open yourself.",
    points: [
      "Daily and weekly briefs with linked sources",
      "Claim Check: test a claim against available evidence",
      "External text is treated as data, never as instructions",
      "Clear labels on every statement",
    ],
    href: "/ai",
    cta: "Open AI Intelligence",
    visual: "ai",
  },
  {
    id: "historical",
    eyebrow: "Historical intelligence",
    title: "Put today in the context of every cycle.",
    body: "Drawdowns, recoveries, distance from the all-time high, seasonality, volatility regimes and normalised cycle comparisons — built on continuous daily history from a single, labelled source.",
    points: [
      "Normalised cycle comparison and historical analogues",
      "Drawdown and recovery analysis",
      "Seasonality shown with its sample size",
      "Stress tests based on historical shocks",
    ],
    href: "/historical",
    cta: "Open Historical",
    visual: "historical",
  },
  {
    id: "future",
    eyebrow: "Future intelligence",
    title: "Scenario ranges — not predictions.",
    body: "Future intelligence shows a spread of plausible outcomes with explicit uncertainty, the model version and the publication time. Published forecasts are immutable and are later compared with what actually happened.",
    points: [
      "Percentile ranges across several horizons",
      "Model version and timestamp on every forecast",
      "Forecast history and forecast-versus-actual evaluation",
      "Invalidation conditions stated up front",
    ],
    href: "/future",
    cta: "Open Future",
    visual: "future",
  },
  {
    id: "tradelab",
    eyebrow: "Trade Lab",
    title: "Practise with virtual capital. Always simulated.",
    body: "A full paper-trading engine with market, limit and stop orders, fees and slippage, historical replay, strategy backtests and a trading journal. No real money and no real orders — ever.",
    points: [
      "Virtual capital with modelled fees and slippage",
      "Historical replay without lookahead",
      "Strategy Lab with a buy-and-hold benchmark",
      "Journal, R-multiples and performance review",
    ],
    href: "/trade-lab",
    cta: "Open Trade Lab",
    visual: "tradelab",
    badge: "SIMULATED",
  },
  {
    id: "social",
    eyebrow: "Social intelligence",
    title: "Signals from people — with verification visible.",
    body: "Follow traders whose results are verified, read sentiment in context and report scams. Verified, unverified and simulated performance are always labelled differently.",
    points: [
      "Distinct badges for verified, unverified and simulated results",
      "Simulated mimic only — never real copy-trading",
      "Report scams, impersonation and fake performance",
      "Visibility controls for your own profile",
    ],
    href: "/social",
    cta: "Open Social",
    visual: "social",
    badge: "BETA",
  },
  {
    id: "alerts",
    eyebrow: "Alerts",
    title: "Know when it matters — not every minute.",
    body: "Price, wallet, whale, regime, news and forecast alerts with cooldowns and de-duplication, delivered to your notification center.",
    points: [
      "Price level and percentage-move alerts",
      "Wallet activity and whale thresholds",
      "Regime-change and forecast-change alerts",
      "Anti-spam: cooldowns and daily caps",
    ],
    href: "/alerts",
    cta: "Open Alerts",
    visual: "alerts",
  },
];

/** "Every screen answers…" — spec §347. */
export const SCREEN_QUESTIONS = [
  "What am I looking at?",
  "Why does it matter?",
  "Where did this data come from?",
  "How fresh is it?",
  "What does it mean?",
  "What is uncertain?",
];

export const SECURITY_POINTS = [
  {
    icon: "KeyRound",
    title: "Never your keys",
    body: "XRP Terminal never asks for, stores or transmits seed phrases or private keys. Anyone asking for them on our behalf is a scammer.",
  },
  {
    icon: "Ban",
    title: "No custody, deposits or withdrawals",
    body: "We never hold crypto or fiat, never receive deposits, never process withdrawals and never sign transactions for you.",
  },
  {
    icon: "Eye",
    title: "Read-only connections",
    body: "Wallets are tracked by public address. Exchange connections are built for read-only API keys: never grant trading or withdrawal permissions — keys that expose them are rejected wherever the exchange lets us detect it.",
  },
  {
    icon: "Lock",
    title: "Encrypted credentials",
    body: "Read-only exchange credentials are encrypted at rest with a server-side key and are never shown again — not even to administrators.",
  },
  {
    icon: "Database",
    title: "Row-level security",
    body: "Every user-owned table is protected by PostgreSQL row-level security: accounts can read only their own private data.",
  },
  {
    icon: "FlaskConical",
    title: "Simulation stays simulation",
    body: "Trade Lab uses virtual capital only. There is no real trade execution anywhere in the product.",
  },
] as const;

/** API permission model (spec §03) shown as a manifest. */
export const PERMISSION_MODEL: { scope: string; value: "YES" | "NO" | "NEVER" }[] = [
  { scope: "READ", value: "YES" },
  { scope: "TRADING", value: "NO" },
  { scope: "WITHDRAWALS", value: "NO" },
  { scope: "TRANSFERS", value: "NO" },
  { scope: "PRIVATE KEY", value: "NEVER" },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Is XRP Terminal affiliated with Ripple?",
    a: "No. XRP Terminal is an independent software and analytics platform and is not affiliated with, endorsed by, or sponsored by Ripple Labs Inc.",
  },
  {
    q: "Do you hold my XRP or my money?",
    a: "No. XRP Terminal is non-custodial. We never hold crypto-assets or fiat, never accept deposits, never process withdrawals and never execute real trades.",
  },
  {
    q: "Will you ever ask for my seed phrase or private key?",
    a: "Never. You connect wallets by public address only. If anyone asks for your seed phrase or private key claiming to be XRP Terminal, it is a scam.",
  },
  {
    q: "Where does the data come from?",
    a: "Market prices come from public APIs of major exchanges (currently Coinbase, Kraken, Bitstamp and Binance, with automatic failover), supply data from CoinGecko, FX from European Central Bank reference rates, and ledger data directly from public XRP Ledger servers. Every data point shows its source and time. We have no commercial relationship with these providers unless stated.",
  },
  {
    q: "Is the data real-time?",
    a: "Where a streaming source exists, yes — and it is marked LIVE. Polled data is marked RECENT, and anything older than its expected refresh interval is marked STALE. We never label data as live when it is not.",
  },
  {
    q: "Are the forecasts predictions?",
    a: "No. Future intelligence shows scenario ranges with explicit uncertainty, the model version and the publication time. They describe plausible outcomes based on historical behaviour; they are not predictions, recommendations or guarantees.",
  },
  {
    q: "Is Trade Lab real trading?",
    a: "No. Trade Lab is a simulation that uses virtual capital with live or historical prices. No orders are ever sent to an exchange, and simulated performance does not guarantee future results.",
  },
  {
    q: "What does the Free plan include?",
    a: "Live market data and charts, the public XRPL explorer and wallet lookup, historical statistics, scenario ranges for shorter horizons, Trade Lab with virtual capital, one connected wallet and five alerts. No card is required.",
  },
  {
    q: "Do I need an account?",
    a: "No. You can use XRP Terminal in guest mode, where your settings, watchlists and paper trades are stored in your browser only. An account adds cloud sync across devices and paid plans.",
  },
  {
    q: "Can I cancel a subscription at any time?",
    a: "Yes. Paid plans are billed monthly through Stripe and can be cancelled from Settings → Billing. Your plan remains active until the end of the paid period.",
  },
  {
    q: "How is my personal data handled?",
    a: "We collect only what is needed to run the service, use strictly necessary storage by default, and let you export or delete your data at any time from Settings. See the Privacy Policy for details on processors and retention.",
  },
  {
    q: "Is anything here investment advice?",
    a: "No. All information, analytics and scenarios are for informational and analytical purposes only and do not constitute personalised investment advice. Crypto-assets are volatile and you may lose some or all of your capital.",
  },
];
