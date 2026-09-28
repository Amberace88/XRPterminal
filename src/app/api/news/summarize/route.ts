import { z } from "zod";
import { getNewsFeed } from "@/lib/news/server";
import { cachedSummary, summarizeCluster } from "@/lib/intel/ai";
import { enforceAiQuota } from "@/lib/intel/usage";
import { isAiConfigured } from "@/lib/server/env";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";

export const maxDuration = 30;
const B = z.object({ clusterId: z.string().regex(/^[0-9a-f]{8}$/) });

/** POST /api/news/summarize — optional AI summary of one story cluster (cached per cluster). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "news-summary", 20, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isAiConfigured()) return ok({ status: "not_configured" as const, summary: null, message: "Summary requires AI provider." });
  const feed = await getNewsFeed();
  const cluster = feed.clusters.find((c) => c.id === b.data.clusterId);
  if (!cluster) return fail("NOT_FOUND", "Story not found in the current feed.", 404);
  const label = "AI summary of headlines & teasers — may omit context. Read the original articles.";
  const hit = cachedSummary(cluster.id);
  if (hit) return ok({ status: "ok" as const, ...hit, label });
  const quota = await enforceAiQuota(req, "ai");
  if (quota instanceof Response) return quota;
  try {
    const r = await summarizeCluster(cluster, quota.userId);
    return ok({ status: "ok" as const, ...r, label });
  } catch (e) {
    log("warn", "news summary failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("AI_ERROR", "Summary could not be generated right now.", 502, true);
  }
}
