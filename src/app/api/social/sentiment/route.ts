import type { NextRequest } from "next/server";
import { z } from "zod";
import { getNewsFeed } from "@/lib/news/server";
import { aggregateSentiment } from "@/lib/social/sentiment";
import { fail, limitOr429, ok, parseQuery } from "@/lib/server/api";

const Q = z.object({ hours: z.coerce.number().int().refine((h) => [24, 72, 168].includes(h), "hours must be 24, 72 or 168").default(72) });

/** GET /api/social/sentiment — headline sentiment (news-derived). One vote per story cluster. */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "sentiment", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const feed = await getNewsFeed();
    const since = Date.now() - q.data.hours * 3_600_000;
    const clusters = feed.clusters.filter((c) => c.relevance === "XRP" && c.lastPublishedAt >= since);
    const result = aggregateSentiment(clusters.map((c) => ({ title: c.title, source: c.lead.source, publishedAt: c.firstPublishedAt })));
    return ok({ ...result, hours: q.data.hours, title: "Headline sentiment (news-derived)", disclaimer: "Measures the tone of headlines, not the market. Not a price signal.", fetchedAt: feed.fetchedAt }, { cacheSeconds: 600 });
  } catch {
    return fail("NEWS_UNAVAILABLE", "News sources are temporarily unavailable.", 503, true);
  }
}
