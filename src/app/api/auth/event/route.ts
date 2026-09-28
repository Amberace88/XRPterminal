import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, limitOr429, ok, parseBody } from "@/lib/server/api";
import { recordAuthEvent } from "@/lib/admin/security";

export const dynamic = "force-dynamic";

/**
 * Called by the auth UI after client-side Supabase auth actions so they are audited and
 * trigger security notifications. The user is resolved from the session cookie — the
 * body only names the event type, never the user.
 */
const Body = z.object({
  event: z.enum(["login", "logout", "password_changed", "sessions_revoked"]),
  method: z.enum(["password", "magic_link", "oauth", "email_link"]).optional(),
});

export async function POST(req: Request) {
  const limited = limitOr429(req, "auth-event", 20, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", "No active session", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return ok({ recorded: false });
  await recordAuthEvent(admin, user, b.data.event, req, b.data.method);
  return ok({ recorded: true });
}
