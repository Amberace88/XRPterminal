/**
 * News engine types (spec §75–78). We store METADATA ONLY — never full articles.
 */

export const NEWS_CATEGORIES = [
  "MARKET",
  "XRPL",
  "RIPPLE",
  "REGULATION",
  "INSTITUTIONAL",
  "PAYMENTS",
  "RLUSD",
  "EXCHANGES",
  "MACRO",
  "TECHNOLOGY",
  "SECURITY",
  "DEVELOPMENT",
  "COMMUNITY",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/** XRP = mentions XRP/XRPL/Ripple/RLUSD or related names; MARKET = general crypto market / macro context. */
export type NewsRelevance = "XRP" | "MARKET";

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  homepage: string;
  /** Feed is scoped to XRP by the publisher (e.g. a tag feed) — items are XRP-relevant by definition. */
  xrpScoped?: boolean;
  /** Failure is expected/tolerated (feed may not exist). */
  optional?: boolean;
}

export interface NewsItem {
  id: string; // stable hash of url
  title: string;
  source: string; // publisher display name
  sourceId: string;
  url: string;
  publishedAt: number; // UTC ms — from the feed, never invented
  /** ≤ ~200 chars, HTML stripped. Publisher's own teaser text, truncated. */
  excerpt: string;
  categories: NewsCategory[];
  primaryCategory: NewsCategory;
  entities: string[];
  relevance: NewsRelevance;
}

export interface NewsCluster {
  id: string;
  title: string;
  /** Lead (earliest) report */
  lead: NewsItem;
  items: NewsItem[];
  sources: string[]; // distinct publisher names
  sourceCount: number;
  firstPublishedAt: number;
  lastPublishedAt: number;
  categories: NewsCategory[];
  primaryCategory: NewsCategory;
  entities: string[];
  relevance: NewsRelevance;
}

export interface NewsSourceHealth {
  id: string;
  name: string;
  homepage: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  latencyMs?: number;
  itemCount: number;
  keptCount: number;
  lastSuccess?: number;
  message?: string;
  optional?: boolean;
}

export interface NewsFeed {
  clusters: NewsCluster[];
  sources: NewsSourceHealth[];
  fetchedAt: number;
  itemCount: number;
  methodology: string;
}

export interface NewsEvent {
  clusterId: string;
  title: string;
  category: NewsCategory;
  /** Publication time of the first report — NOT an event date. */
  firstReportedAt: number;
  sourceCount: number;
  verification: "MULTI_SOURCE" | "SINGLE_SOURCE";
  label: string;
  links: { source: string; url: string; publishedAt: number }[];
}
