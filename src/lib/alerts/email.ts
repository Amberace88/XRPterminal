import "server-only";
import { log } from "@/lib/server/api";

/**
 * Email channel (spec §126). Only active when an email provider is configured:
 * RESEND_API_KEY + ALERTS_EMAIL_FROM (Resend HTTP API). Otherwise the channel reports
 * "not configured" and nothing is sent.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERTS_EMAIL_FROM);
}

export async function sendAlertEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERTS_EMAIL_FROM,
        to: [to],
        subject: subject.slice(0, 140),
        text: `${text}\n\n—\nXRP Terminal alert. Informational only, not investment advice. Manage alerts: ${process.env.NEXT_PUBLIC_SITE_URL || "https://xrpterminal.com"}/alerts`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log("warn", "alert email failed", { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log("warn", "alert email failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
