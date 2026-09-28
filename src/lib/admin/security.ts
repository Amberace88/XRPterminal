import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { writeAudit } from "./server";

export type AuthEvent = "login" | "logout" | "password_changed" | "sessions_revoked";

/** Coarse, non-reversible device fingerprint: hash of the user-agent family only. */
export function uaFingerprint(ua: string | null): string {
  const family = (ua ?? "unknown")
    .replace(/\d+(\.\d+)*/g, "") // drop versions so browser updates don't look like new devices
    .slice(0, 300);
  return createHash("sha256").update(family).digest("hex").slice(0, 16);
}

function describeUa(ua: string | null): string {
  if (!ua) return "an unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "an unknown OS";
  return `${browser} on ${os}`;
}

/**
 * Audit + security notifications (spec §143, §257). A "new sign-in" notice is created
 * when a login comes from a device fingerprint not seen in this user's last 50 logins.
 */
export async function recordAuthEvent(
  admin: SupabaseClient,
  user: User,
  event: AuthEvent,
  req: Request,
  method?: "password" | "magic_link" | "oauth" | "email_link",
): Promise<void> {
  const ua = req.headers.get("user-agent");
  const fp = uaFingerprint(ua);

  if (event === "login") {
    const { data: prev } = await admin
      .from("audit_logs")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("action", "auth.login")
      .order("created_at", { ascending: false })
      .limit(50);
    const seen = (prev ?? []).some((r) => (r.metadata as { ua?: string } | null)?.ua === fp);
    if ((prev ?? []).length > 0 && !seen) {
      await admin.from("notifications").insert({
        user_id: user.id,
        category: "security",
        title: "New sign-in to your account",
        body: `A sign-in from ${describeUa(ua)} was detected. If this wasn't you, change your password and sign out all sessions in Settings → Security.`,
        href: "/settings#security",
        priority: "critical",
      });
    }
  } else if (event === "password_changed") {
    await admin.from("notifications").insert({
      user_id: user.id,
      category: "security",
      title: "Your password was changed",
      body: "If you did not make this change, reset your password immediately and sign out all sessions.",
      href: "/settings#security",
      priority: "critical",
    });
  } else if (event === "sessions_revoked") {
    await admin.from("notifications").insert({
      user_id: user.id,
      category: "security",
      title: "All sessions signed out",
      body: "Every active session for your account was signed out.",
      href: "/settings#security",
      priority: "normal",
    });
  }

  await writeAudit(admin, {
    action: `auth.${event}`,
    actorId: user.id,
    userId: user.id,
    metadata: { ua: fp, method: method ?? null },
    req,
  });
}
