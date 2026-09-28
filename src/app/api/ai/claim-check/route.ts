import { z } from "zod";
import { runClaimCheck } from "@/lib/intel/ai";
import { enforceAiQuota } from "@/lib/intel/usage";
import { isAiConfigured } from "@/lib/server/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import type { ClaimCheckResult } from "@/lib/intel/claim";

export const maxDuration = 90;
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;
const B = z.object({
  claim: z.string().trim().min(10, "Paste a claim of at least 10 characters").max(600),
  allowedDomains: z.array(z.string().trim().toLowerCase().regex(DOMAIN, "Invalid domain")).max(10).optional(),
});

async function store(r: ClaimCheckResult, userId: string | null) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { data, error } = await sb
    .from("claims")
    .insert({ user_id: userId, claim: r.claim, classification: r.classification, model_classification: r.modelClassification, confidence: r.confidence, reasoning: r.reasoning, context: r.context, adjustments: r.adjustments, model: r.model })
    .select("id")
    .single();
  if (error || !data) return log("warn", "claim store failed", { error: error?.message });
  const rows = [
    ...r.evidence.map((e) => ({ claim_id: data.id, kind: "supporting", summary: e.summary, url: e.url, source: e.source, published: e.date })),
    ...r.counter_evidence.map((e) => ({ claim_id: data.id, kind: "counter", summary: e.summary, url: e.url, source: e.source, published: e.date })),
  ];
  if (rows.length) await sb.from("claim_evidence").insert(rows);
}

/** POST /api/ai/claim-check — web-search-backed claim verification with anti-fabrication post-processing. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "claim-check", 4, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isAiConfigured()) return fail("AI_NOT_CONFIGURED", "AI provider not connected.", 503);
  const quota = await enforceAiQuota(req, "claim");
  if (quota instanceof Response) return quota;
  try {
    const result = await runClaimCheck(b.data.claim, { allowedDomains: b.data.allowedDomains, userId: quota.userId });
    void store(result, quota.userId);
    return ok(result);
  } catch (e) {
    log("warn", "claim check failed", { error: e instanceof Error ? e.message : String(e) });
    return fail("AI_ERROR", "Claim Check could not complete (AI provider or search error). Try again shortly.", 502, true);
  }
}
