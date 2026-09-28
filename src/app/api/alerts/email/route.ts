import { z } from "zod";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase/server";
import { isEmailConfigured, sendAlertEmail } from "@/lib/alerts/email";
import { fail, ok, parseBody, rateLimit } from "@/lib/server/api";

const B = z.object({ title: z.string().trim().min(1).max(140), body: z.string().trim().max(1000).default(""), test: z.boolean().optional() });

/** POST /api/alerts/email — deliver a client-evaluated alert to the signed-in user's own email. */
export async function POST(req: Request) {
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isEmailConfigured()) return fail("NOT_CONFIGURED", "Email provider not configured.", 503);
  const user = await getCurrentUser();
  if (!user?.email) return fail("UNAUTHORIZED", "Sign in to receive email alerts.", 401);
  const rl = rateLimit(`alert-email:${user.id}`, 20, 3_600_000);
  if (!rl.allowed) return fail("RATE_LIMITED", "Email alert limit reached (20/hour).", 429, true);
  const sb = await getSupabaseServer();
  const { data: settings } = await sb!.from("alert_settings").select("email").eq("user_id", user.id).maybeSingle();
  if (!b.data.test && !settings?.email) return fail("DISABLED", "Email channel is disabled in your alert settings.", 400);
  const sent = await sendAlertEmail(user.email, `XRP Terminal alert: ${b.data.title}`, b.data.body || b.data.title);
  return sent ? ok({ sent: true }) : fail("EMAIL_FAILED", "Email could not be sent.", 502, true);
}
