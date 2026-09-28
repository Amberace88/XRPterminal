/** OAuth providers shown on auth pages — only those listed in NEXT_PUBLIC_AUTH_PROVIDERS (e.g. "google,github"). */
export type OAuthProvider = "google" | "github";
const SUPPORTED: OAuthProvider[] = ["google", "github"];

export function parseAuthProviders(raw: string | undefined | null): OAuthProvider[] {
  if (!raw) return [];
  const seen = new Set<OAuthProvider>();
  for (const p of raw.split(",").map((s) => s.trim().toLowerCase())) {
    if ((SUPPORTED as string[]).includes(p)) seen.add(p as OAuthProvider);
  }
  return [...seen];
}

export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

/** Only same-site relative paths are allowed as post-auth destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Password policy for signup / reset. Returns a 0–4 score and unmet requirements. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; unmet: string[] } {
  const unmet: string[] = [];
  if (pw.length < 10) unmet.push("At least 10 characters");
  if (!/[a-zA-Z]/.test(pw)) unmet.push("A letter");
  if (!/\d/.test(pw)) unmet.push("A number");
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;
  if (unmet.length) score = Math.min(score, 1);
  return { score: score as 0 | 1 | 2 | 3 | 4, unmet };
}
