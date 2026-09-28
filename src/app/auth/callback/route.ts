import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { recordAuthEvent } from "@/lib/admin/security";
import { log } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** Only same-site relative paths are allowed as post-auth destinations (no open redirects). */
function safeNext(next: string | null, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Supabase auth callback: OAuth / PKCE (`code`) and email links (`token_hash` + `type`).
 * Establishes the session cookie, audits the sign-in, then redirects to `next`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const errorDescription = url.searchParams.get("error_description");
  let next = safeNext(url.searchParams.get("next"));

  const fail = (reason: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
  if (errorDescription) return fail(errorDescription.slice(0, 200));

  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.redirect(`${origin}/login`);

  let method: "oauth" | "email_link" = "oauth";
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      log("warn", "exchangeCodeForSession failed", { error: error.message });
      return fail("This sign-in link is invalid or has expired. Please try again.");
    }
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    method = "email_link";
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("This email link is invalid or has expired. Please request a new one.");
    if (type === "recovery") next = "/reset-password";
  } else {
    return fail("Missing authentication code.");
  }

  const { data } = await sb.auth.getUser();
  const admin = getSupabaseAdmin();
  if (data.user && admin) {
    await recordAuthEvent(admin, data.user, "login", req, method).catch(() => undefined);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
