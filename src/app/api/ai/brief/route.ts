import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSnapshot } from "@/lib/intel/snapshot";
import { buildDataBrief } from "@/lib/intel/brief";
import { getAiNarrative } from "@/lib/intel/ai";
import { isAiConfigured } from "@/lib/server/env";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";
import type { AiNarrative, AiStatus } from "@/lib/intel/types";

export const maxDuration = 60;
const Q = z.object({
  type: z.enum(["daily", "weekly"]).default("daily"),
  narrative: z.enum(["0", "1"]).default("0"),
});

/**
 * GET /api/ai/brief?type=daily|weekly&narrative=0|1
 * Always returns the deterministic data brief + snapshot; adds the AI narrative when
 * requested and an AI provider is configured (cached 1h daily / 6h weekly).
 */
export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "ai-brief", 30, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  try {
    const snapshot = await getSnapshot(q.data.type);
    const brief = buildDataBrief(snapshot);
    let ai: { status: AiStatus; narrative: AiNarrative | null; message?: string } = { status: "skipped", narrative: null };
    if (q.data.narrative === "1") {
      if (!isAiConfigured()) ai = { status: "not_configured", narrative: null, message: "AI provider not connected." };
      else {
        try {
          ai = { status: "ok", narrative: await getAiNarrative(snapshot) };
        } catch (e) {
          log("warn", "ai narrative failed", { error: e instanceof Error ? e.message : String(e) });
          ai = { status: "error", narrative: null, message: "AI narrative temporarily unavailable. The data brief below is unaffected." };
        }
      }
    }
    const cacheSeconds = q.data.narrative === "1" && ai.status === "ok" ? (q.data.type === "weekly" ? 3600 : 900) : 300;
    return ok({ brief, snapshot, ai, aiConfigured: isAiConfigured() }, { cacheSeconds });
  } catch (e) {
    log("error", "brief failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("BRIEF_UNAVAILABLE", "Brief could not be built right now.", 503, true);
  }
}
