import { describe, expect, it } from "vitest";
import { CONSENT_MAX_AGE_MS, DEFAULT_CONSENT, consentAllows, normalizeConsent } from "@/components/marketing/consent";

describe("cookie consent", () => {
  it("defaults to necessary-only (privacy by default)", () => {
    expect(DEFAULT_CONSENT).toEqual({ necessary: true, analytics: false, marketing: false, decidedAt: null });
    expect(normalizeConsent(null)).toEqual(DEFAULT_CONSENT);
    expect(normalizeConsent("garbage")).toEqual(DEFAULT_CONSENT);
    expect(normalizeConsent({ analytics: true })).toEqual(DEFAULT_CONSENT); // no decision timestamp → not a decision
  });

  it("necessary storage is always allowed; optional needs an explicit, recent opt-in", () => {
    const now = 1_760_000_000_000;
    expect(consentAllows(null, "necessary", now)).toBe(true);
    expect(consentAllows(null, "analytics", now)).toBe(false);
    expect(consentAllows({ necessary: true, analytics: true, marketing: false, decidedAt: now - 1000 }, "analytics", now)).toBe(true);
    expect(consentAllows({ necessary: true, analytics: true, marketing: false, decidedAt: now - 1000 }, "marketing", now)).toBe(false);
    expect(consentAllows({ necessary: true, analytics: "yes", decidedAt: now }, "analytics", now)).toBe(false);
    expect(consentAllows({ necessary: true, analytics: true, marketing: true, decidedAt: now - CONSENT_MAX_AGE_MS - 1 }, "analytics", now)).toBe(false);
  });
});
