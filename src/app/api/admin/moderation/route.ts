import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/admin/server";
import { fail, ok, parseBody } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * Moderation actions on social reports (spec §165/§166). social_reports and social content
 * tables are owned by 0060_intel.sql; this route updates them defensively and reports
 * exactly what it could and could not change. Every action is audited.
 */
const Body = z.object({
  reportId: z.union([z.string().max(64), z.number().int()]),
  action: z.enum(["resolve", "dismiss", "hide_content", "restore_content"]),
  note: z.string().max(500).optional(),
});

const STATUS: Record<z.infer<typeof Body>["action"], string> = {
  resolve: "resolved",
  dismiss: "dismissed",
  hide_content: "actioned",
  restore_content: "resolved",
};

export async function POST(req: Request) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const { admin, user } = g.ctx;
  const { reportId, action, note } = b.data;

  const { data: report, error: rErr } = await admin.from("social_reports").select("*").eq("id", reportId).maybeSingle();
  if (rErr) return fail("NOT_AVAILABLE", `social_reports unavailable: ${rErr.message}`, 503);
  if (!report) return fail("NOT_FOUND", "Report not found", 404);

  const warnings: string[] = [];
  const now = new Date().toISOString();
  let upd = await admin.from("social_reports").update({ status: STATUS[action], resolved_by: user.id, resolved_at: now }).eq("id", reportId);
  if (upd.error) {
    upd = await admin.from("social_reports").update({ status: STATUS[action] }).eq("id", reportId);
    if (upd.error) warnings.push(`Report status not updated: ${upd.error.message}`);
  }

  if (action === "hide_content" || action === "restore_content") {
    const r = report as Record<string, unknown>;
    const postId = (r.post_id as string | undefined) ?? (r.target_type === "post" ? (r.target_id as string | undefined) : undefined);
    if (!postId) warnings.push("Report does not reference a post; nothing hidden/restored.");
    else {
      const { error } = await admin.from("social_posts").update({ hidden: action === "hide_content" }).eq("id", postId);
      if (error) warnings.push(`Content visibility not changed: ${error.message}`);
    }
  }

  await writeAudit(admin, {
    action: `moderation.${action}`,
    actorId: user.id,
    targetType: "social_report",
    targetId: String(reportId),
    metadata: { note: note ?? null, warnings },
    req,
  });
  return ok({ done: warnings.length === 0, warnings });
}
