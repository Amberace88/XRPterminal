import type { Provenance } from "@/lib/types/market";
import type { NewsCategory } from "@/lib/news/types";
import type { Regime, RiskLevel } from "@/lib/analytics/regime";
import type { SentimentResult } from "@/lib/social/sentiment";

/** Structured internal data the AI briefs are built from (spec §68: AI must use structured internal data). */

export interface SourceRef {
  label: string;
  url?: string;
  provider?: string;
  timestamp?: number;
}

export interface SnapshotNews {
  id: string;
  title: string;
  url: string;
  source: string;
  sources: string[];
  sourceCount: number;
  publishedAt: number;
  category: NewsCategory;
  categories: NewsCategory[];
}

export interface IntelSnapshot {
  type: "daily" | "weekly";
  asOf: number;
  market: {
    available: boolean;
    price: number | null;
    changePct24h: number | null;
    high24h: number | null;
    low24h: number | null;
    volume24hQuote: number | null;
    provenance: Provenance | null;
    error?: string;
  };
  returns: { d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  history: {
    available: boolean;
    provenance: Provenance | null;
    days: number;
    firstDate: number | null;
    athClose: number | null;
    athDate: number | null;
    pctFromAth: number | null;
    high52w: number | null;
    low52w: number | null;
    ret30Percentile: number | null; // current 30D return vs all historical 30D windows
    ret7Percentile: number | null;
    volume7vs30: number | null; // ratio
    error?: string;
  };
  regime: {
    current: Regime | null;
    previous: Regime | null; // 1 day ago (daily) / 7 days ago (weekly)
    changed: boolean;
    explanation: string | null;
    sma50: number | null;
    sma200: number | null;
    methodologyVersion: string | null;
  };
  risk: { level: RiskLevel | null; score: number | null; topComponents: { name: string; detail: string }[]; explanation: string | null };
  volatility: { vol30Pct: number | null; vol7Pct: number | null; percentile: number | null };
  correlation: { btc30: number | null; btc90: number | null; eth30: number | null; eth90: number | null; btcChange7d: number | null; btcChange1d: number | null; provider: string | null };
  xrpl: {
    available: boolean;
    server: string | null;
    validatedLedger: number | null;
    ledgersSampled: number;
    avgTxPerLedger: number | null;
    baseFeeXrp: number | null;
    loadFactor: number | null;
    error?: string;
  };
  news: { available: boolean; clusters: SnapshotNews[]; windowHours: number; sourcesHealthy: number; sourcesTotal: number; error?: string };
  sentiment: SentimentResult | null;
  providers: string[];
}

export type BriefItemKind = "FACT" | "ANALYSIS" | "SCENARIO" | "UNAVAILABLE";

export interface BriefItem {
  kind: BriefItemKind;
  text: string;
  sources: SourceRef[];
}

export interface BriefSection {
  id: string;
  n: number;
  title: string;
  items: BriefItem[];
}

export interface DataBrief {
  type: "daily" | "weekly";
  title: string;
  generatedAt: number;
  asOf: number;
  headline: string;
  sections: BriefSection[];
  methodology: string;
}

export interface AiNarrative {
  summary: string;
  facts: string[];
  analysis: string[];
  historical_context: string[];
  scenarios: string[];
  risks: string[];
  watch_items: string[];
  sources: { title: string; url: string }[];
  model: string;
  generatedAt: number;
  cached: boolean;
}

export type AiStatus = "ok" | "not_configured" | "error" | "skipped";
