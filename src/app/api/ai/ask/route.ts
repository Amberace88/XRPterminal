import { z } from "zod";
import { getSnapshot } from "@/lib/intel/snapshot";
import { answerQuestion } from "@/lib/intel/ai";
import { enforceAiQuota } from "@/lib/intel/usage";
import { isAiConfigured } from "@/lib/server/env";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";

export const maxDuration = 60;
const B = z.object({
  question: z.string().trim().min(3, "Ask a question").max(500),
  webSearch: z.boolean().optional().default(false),
});

/** POST /api/ai/ask — "Ask XRP Terminal": answers only from the structured snapshot. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "ai-ask", 8, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isAiConfigured()) return fail("AI_NOT_CONFIGURED", "AI provider not connected.", 503);
  const quota = await enforceAiQuota(req, "ai");
  if (quota instanceof Response) return quota;
  const webSearch = b.data.webSearch && quota.plan !== "free";
  try {
    const snapshot = await getSnapshot("daily");
    const answer = await answerQuestion(b.data.question, snapshot, { webSearch, userId: quota.userId });
    return ok({ ...answer, webSearchRequested: b.data.webSearch, webSearchAllowed: quota.plan !== "free" });
  } catch (e) {
    log("warn", "ask failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("AI_ERROR", "The AI provider did not return an answer. Try again shortly.", 502, true);
  }
}
