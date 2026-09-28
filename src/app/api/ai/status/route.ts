import { isAiConfigured, isServiceRoleConfigured } from "@/lib/server/env";
import { isSupabaseConfigured } from "@/lib/config";
import { isEmailConfigured } from "@/lib/alerts/email";
import { ok } from "@/lib/server/api";

/** GET /api/ai/status — which optional integrations are configured (booleans only). */
export async function GET() {
  return ok(
    {
      ai: isAiConfigured(),
      supabase: isSupabaseConfigured(),
      serviceRole: isServiceRoleConfigured(),
      email: isEmailConfigured(),
      telegram: false,
      discord: false,
    },
    { cacheSeconds: 60 },
  );
}
