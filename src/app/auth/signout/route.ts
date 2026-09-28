import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { recordAuthEvent } from "@/lib/admin/security";

export const dynamic = "force-dynamic";

/** Server-side sign-out (POST only, so it cannot be triggered by a cross-site image/link). */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const sb = await getSupabaseServer();
  if (sb) {
    const { data } = await sb.auth.getUser();
    const admin = getSupabaseAdmin();
    if (data.user && admin) await recordAuthEvent(admin, data.user, "logout", req).catch(() => undefined);
    await sb.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
