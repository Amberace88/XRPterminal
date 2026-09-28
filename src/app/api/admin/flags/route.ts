import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/admin/server";
import { fail, ok, parseBody } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const Body = z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]{2,64}$/), enabled: z.boolean() });

/** Toggle a feature flag (spec §241/§242). Risky features can never be switched on silently. */
const NEVER_ENABLE = new Set(["liveTradingBridge"]);

export async function POST(req: Request) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  if (b.data.enabled && NEVER_ENABLE.has(b.data.key)) return fail("FORBIDDEN", "This feature cannot be enabled in the MVP.", 403);
  const { admin, user } = g.ctx;
  const { data: before } = await admin.from("feature_flags").select("enabled").eq("key", b.data.key).maybeSingle();
  if (!before) return fail("NOT_FOUND", "Unknown flag", 404);
  const { error } = await admin.from("feature_flags").update({ enabled: b.data.enabled, updated_by: user.id }).eq("key", b.data.key);
  if (error) return fail("DATABASE_ERROR", error.message, 500, true);
  await writeAudit(admin, {
    action: "admin.feature_flag_changed",
    actorId: user.id,
    targetType: "feature_flag",
    targetId: b.data.key,
    metadata: { from: before.enabled, to: b.data.enabled },
    req,
  });
  return ok({ updated: true });
}
