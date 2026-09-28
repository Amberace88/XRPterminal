import type { NextRequest } from "next/server";
import { z } from "zod";
import { getNewsFeed, NEWS_REVALIDATE_SECONDS } from "@/lib/news/server";
import { deriveEvents } from "@/lib/news/cluster";
import { NEWS_CATEGORIES } from "@/lib/news/types";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({
  category: z.enum(NEWS_CATEGORIES).optional(),
  relevance: z.enum(["xrp", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(120),
});

/** GET /api/news — clustered headline metadata from public RSS feeds + source health + events. */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "news", 120, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const feed = await getNewsFeed();
    let clusters = feed.clusters;
    if (q.data.relevance === "xrp") clusters = clusters.filter((c) => c.relevance === "XRP");
    if (q.data.category) clusters = clusters.filter((c) => c.categories.includes(q.data.category!));
    return ok(
      {
        clusters: clusters.slice(0, q.data.limit),
        total: clusters.length,
        events: deriveEvents(feed.clusters),
        sources: feed.sources,
        fetchedAt: feed.fetchedAt,
        itemCount: feed.itemCount,
        methodology: feed.methodology,
      },
      { cacheSeconds: NEWS_REVALIDATE_SECONDS },
    );
  } catch (e) {
    log("error", "news feed failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("NEWS_UNAVAILABLE", "News sources are temporarily unavailable.", 503, true);
  }
}
