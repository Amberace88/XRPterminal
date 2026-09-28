/**
 * Cookie-consent model (spec §196) — pure helpers shared by the cookie banner,
 * settings and analytics tracking. Default is privacy-first: only strictly
 * necessary storage until the visitor explicitly opts in.
 */
export const CONSENT_STORAGE_KEY = "cookie-consent"; // stored via readLocal/writeLocal as "xrpt:cookie-consent"
export const CONSENT_EVENT = "xrpt-open-cookies";

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: number | null;
}

export const DEFAULT_CONSENT: Readonly<ConsentState> = Object.freeze({
  necessary: true,
  analytics: false,
  marketing: false,
  decidedAt: null,
});

/** Validate whatever is in storage; anything malformed falls back to the default (no consent). */
export function normalizeConsent(raw: unknown): ConsentState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONSENT };
  const r = raw as Record<string, unknown>;
  const decidedAt = typeof r.decidedAt === "number" && Number.isFinite(r.decidedAt) ? r.decidedAt : null;
  if (decidedAt === null) return { ...DEFAULT_CONSENT };
  return { necessary: true, analytics: r.analytics === true, marketing: r.marketing === true, decidedAt };
}

/** Consent older than 12 months should be re-requested (common EU guidance). */
export const CONSENT_MAX_AGE_MS = 365 * 86_400_000;

export function consentAllows(raw: unknown, kind: "necessary" | "analytics" | "marketing", now = Date.now()): boolean {
  if (kind === "necessary") return true;
  const c = normalizeConsent(raw);
  if (c.decidedAt === null || now - c.decidedAt > CONSENT_MAX_AGE_MS) return false;
  return c[kind];
}
