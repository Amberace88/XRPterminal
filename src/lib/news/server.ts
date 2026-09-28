import "server-only";
import { clusterItems } from "./cluster";
import { parseFeed } from "./parse";
import { NEWS_SOURCES } from "./sources";
import type { NewsFeed, NewsItem, NewsSource, NewsSourceHealth } from "./types";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/server/api";

/**
 * News aggregation (server). Each source is fetched independently — a failing
 * source never breaks the endpoint; it is reported in source health.
 * Cached 10 minutes (Next data cache + in-memory memo per instance).
 */
export const NEWS_REVALIDATE_SECONDS = 600;
const MEMO_TTL = NEWS_REVALIDATE_SECONDS * 1000;

export const NEWS_METHODOLOGY =
  "Headlines are collected from public RSS feeds of the listed publishers every ~10 minutes. We keep metadata only (title, publisher, link, publication time and a ≤200-character teaser) and link to the original article. Items are kept when they mention XRP/XRPL/Ripple/RLUSD or related names (XRP), or general crypto-market/macro context (MARKET). Categories and entities come from deterministic keyword rules. Stories are clustered when normalized headline tokens overlap (Jaccard ≥ 0.4) within 48 hours.";

let memo: { feed: NewsFeed; at: number } | null = null;
let inflight: Promise<NewsFeed> | null = null;
const lastGood = new Map<string, { items: NewsItem[]; at: number }>();
let lastPersist = 0;

async function fetchSource(src: NewsSource): Promise<{ items: NewsItem[]; health: NewsSourceHealth }> {
  const t0 = Date.now();
  const base: NewsSourceHealth = { id: src.id, name: src.name, homepage: src.homepage, status: "DOWN", itemCount: 0, keptCount: 0, optional: src.optional };
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: {
        "User-Agent": "XRPTerminal/1.0 (+https://xrpterminal.com; headline metadata only)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: NEWS_REVALIDATE_SECONDS },
    };
    const res = await fetch(src.feedUrl, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parseFeed(xml, src);
    const latency = Date.now() - t0;
    lastGood.set(src.id, { items: parsed.items, at: Date.now() });
    return {
      items: parsed.items,
      health: { ...base, status: latency > 6000 ? "DEGRADED" : "HEALTHY", latencyMs: latency, itemCount: parsed.rawCount, keptCount: parsed.items.length, lastSuccess: Date.now() },
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Timed out" : e.message) : "Fetch failed";
    const prev = lastGood.get(src.id);
    if (prev && Date.now() - prev.at < 6 * 3_600_000) {
      return {
        items: prev.items,
        health: { ...base, status: "DEGRADED", latencyMs: Date.now() - t0, keptCount: prev.items.length, lastSuccess: prev.at, message: `${msg} — serving last successful fetch` },
      };
    }
    return { items: [], health: { ...base, latencyMs: Date.now() - t0, message: msg } };
  }
}

async function build(): Promise<NewsFeed> {
  const results = await Promise.all(NEWS_SOURCES.map(fetchSource));
  const items = results.flatMap((r) => r.items);
  const clusters = clusterItems(items);
  const feed: NewsFeed = {
    clusters,
    sources: results.map((r) => r.health),
    fetchedAt: Date.now(),
    itemCount: items.length,
    methodology: NEWS_METHODOLOGY,
  };
  void persist(items);
  return feed;
}

/** Best-effort persistence of metadata into Supabase `news` (service role, unique url). */
async function persist(items: NewsItem[]) {
  const sb = getSupabaseAdmin();
  if (!sb || Date.now() - lastPersist < MEMO_TTL || items.length === 0) return;
  lastPersist = Date.now();
  try {
    const rows = items.map((i) => ({
      url: i.url,
      title: i.title,
      source: i.source,
      source_id: i.sourceId,
      published_at: new Date(i.publishedAt).toISOString(),
      excerpt: i.excerpt,
      category: i.primaryCategory,
      categories: i.categories,
      entities: i.entities,
      relevance: i.relevance,
      asset: "XRP",
    }));
    const { error } = await sb.from("news").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    if (error) log("warn", "news persist failed", { error: error.message });
  } catch (e) {
    log("warn", "news persist failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function getNewsFeed(force = false): Promise<NewsFeed> {
  if (!force && memo && Date.now() - memo.at < MEMO_TTL) return memo.feed;
  if (inflight) return inflight;
  inflight = build()
    .then((feed) => {
      memo = { feed, at: Date.now() };
      return feed;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
