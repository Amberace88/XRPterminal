import { CATEGORY_PRIORITY } from "./categorize";
import { hashString, intersectionSize, jaccard, normalizeTitle, titleTokens } from "./text";
import type { NewsCategory, NewsCluster, NewsEvent, NewsItem } from "./types";

/**
 * Deduplication & story clustering (spec §77).
 * 1) exact duplicates (same URL or same normalized title from the same publisher) are dropped;
 * 2) items whose title token sets have Jaccard ≥ threshold (and share ≥ minShared tokens)
 *    within a time window are grouped into one story cluster with multiple sources.
 */
export interface ClusterOptions {
  threshold?: number; // Jaccard
  minShared?: number;
  windowMs?: number;
}

export const CLUSTER_DEFAULTS: Required<ClusterOptions> = { threshold: 0.4, minShared: 3, windowMs: 48 * 3_600_000 };

export function dedupeItems(items: NewsItem[]): NewsItem[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: NewsItem[] = [];
  // earliest first so the original report is kept
  for (const it of [...items].sort((a, b) => a.publishedAt - b.publishedAt)) {
    const tKey = `${it.source}|${normalizeTitle(it.title)}`;
    if (seenUrl.has(it.url) || seenTitle.has(tKey)) continue;
    seenUrl.add(it.url);
    seenTitle.add(tKey);
    out.push(it);
  }
  return out;
}

interface Working {
  items: NewsItem[];
  tokens: Set<string>[];
  first: number;
  last: number;
}

export function clusterItems(items: NewsItem[], opts: ClusterOptions = {}): NewsCluster[] {
  const { threshold, minShared, windowMs } = { ...CLUSTER_DEFAULTS, ...opts };
  const unique = dedupeItems(items);
  const working: Working[] = [];
  for (const it of unique) {
    const tk = titleTokens(it.title);
    let best: Working | null = null;
    let bestScore = 0;
    for (const c of working) {
      if (it.publishedAt - c.last > windowMs || c.first - it.publishedAt > windowMs) continue;
      for (const ct of c.tokens) {
        const shared = intersectionSize(tk, ct);
        const need = Math.min(minShared, Math.max(2, Math.min(tk.size, ct.size) - 1));
        if (shared < need) continue;
        const s = jaccard(tk, ct);
        if (s >= threshold && s > bestScore) {
          best = c;
          bestScore = s;
        }
      }
    }
    if (best) {
      best.items.push(it);
      best.tokens.push(tk);
      best.first = Math.min(best.first, it.publishedAt);
      best.last = Math.max(best.last, it.publishedAt);
    } else {
      working.push({ items: [it], tokens: [tk], first: it.publishedAt, last: it.publishedAt });
    }
  }
  return working.map(finalize).sort((a, b) => b.lastPublishedAt - a.lastPublishedAt);
}

function finalize(w: Working): NewsCluster {
  const items = [...w.items].sort((a, b) => a.publishedAt - b.publishedAt);
  const lead = items[0];
  const sources = [...new Set(items.map((i) => i.source))];
  const catSet = new Set<NewsCategory>(items.flatMap((i) => i.categories));
  const categories = CATEGORY_PRIORITY.filter((c) => catSet.has(c));
  // primary: most common primary among items, ties broken by priority order
  const counts = new Map<NewsCategory, number>();
  for (const i of items) counts.set(i.primaryCategory, (counts.get(i.primaryCategory) ?? 0) + 1);
  const primaryCategory = [...counts.entries()].sort((a, b) => b[1] - a[1] || CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]))[0][0];
  return {
    id: hashString(lead.url),
    title: lead.title,
    lead,
    items,
    sources,
    sourceCount: sources.length,
    firstPublishedAt: w.first,
    lastPublishedAt: w.last,
    categories,
    primaryCategory,
    entities: [...new Set(items.flatMap((i) => i.entities))],
    relevance: items.some((i) => i.relevance === "XRP") ? "XRP" : "MARKET",
  };
}

/**
 * Event intelligence (spec §78): derived ONLY from real news clusters in the
 * REGULATION / INSTITUTIONAL / XRPL categories. Never invents events or dates —
 * the only date shown is the publication time of the first report.
 */
export const EVENT_CATEGORIES: NewsCategory[] = ["REGULATION", "INSTITUTIONAL", "XRPL"];

export function deriveEvents(clusters: NewsCluster[], limit = 12): NewsEvent[] {
  return clusters
    .filter((c) => c.relevance === "XRP" && c.categories.some((k) => EVENT_CATEGORIES.includes(k)))
    .slice(0, limit)
    .map((c) => {
      const category = EVENT_CATEGORIES.includes(c.primaryCategory) ? c.primaryCategory : (c.categories.find((k) => EVENT_CATEGORIES.includes(k)) as NewsCategory);
      const multi = c.sourceCount >= 2;
      return {
        clusterId: c.id,
        title: c.title,
        category,
        firstReportedAt: c.firstPublishedAt,
        sourceCount: c.sourceCount,
        verification: multi ? "MULTI_SOURCE" : "SINGLE_SOURCE",
        label: multi ? `Reported by ${c.sourceCount} sources` : "Single source — unverified",
        links: c.items.map((i) => ({ source: i.source, url: i.url, publishedAt: i.publishedAt })),
      };
    });
}
