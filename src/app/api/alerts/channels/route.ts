import { isEmailConfigured } from "@/lib/alerts/email";
import { isSupabaseConfigured } from "@/lib/config";
import { isServiceRoleConfigured } from "@/lib/server/env";
import { ok } from "@/lib/server/api";

/** GET /api/alerts/channels — availability of alert delivery channels (booleans only). */
export async function GET() {
  return ok(
    {
      inApp: true,
      push: true, // browser Notification API — permission is requested client-side
      email: isEmailConfigured() && isSupabaseConfigured(),
      emailReason: !isEmailConfigured() ? "Email provider not configured." : !isSupabaseConfigured() ? "Email alerts require an account." : null,
      serverEvaluation: isSupabaseConfigured() && isServiceRoleConfigured() && Boolean(process.env.CRON_SECRET),
      telegram: false,
      discord: false,
    },
    { cacheSeconds: 60 },
  );
}
