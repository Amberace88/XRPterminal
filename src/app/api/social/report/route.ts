import { z } from "zod";
import { REPORT_CATEGORIES, scanContent } from "@/lib/social/scam";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";

const B = z.object({
  targetType: z.enum(["trader", "content", "news", "wallet", "other"]),
  targetId: z.string().trim().max(200).optional(),
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  details: z.string().trim().max(2000).optional(),
});

/** POST /api/social/report — user report for moderation (spec §88, §165). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "social-report", 5, 10 * 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  const flags = b.data.details ? scanContent(b.data.details).flags : [];
  if (!isSupabaseConfigured()) {
    return fail("NOT_CONFIGURED", "Reporting requires the account database, which is not configured on this deployment.", 503);
  }
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in to submit a report.", 401);
  const sb = await getSupabaseServer();
  const { error } = await sb!.from("social_reports").insert({
    reporter_id: user.id,
    target_type: b.data.targetType,
    target_id: b.data.targetId ?? null,
    category: b.data.category,
    details: b.data.details ?? null,
    content_flags: flags,
  });
  if (error) {
    log("warn", "report insert failed", { error: error.message });
    return fail("REPORT_FAILED", "Report could not be saved. Please try again.", 500, true);
  }
  return ok({ stored: true, flags });
}
