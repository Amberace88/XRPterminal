import { describe, expect, it } from "vitest";
import { ACADEMY_MODULES, getAcademyModule, moduleWordCount } from "@/lib/academy/content";
import { passwordStrength, parseAuthProviders, safeNextPath } from "@/components/auth/providers";
import { toLongCsv } from "@/components/settings/exportCsv";
import { DISALLOWED_PATHS, PUBLIC_PATHS } from "@/components/marketing/seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

describe("academy", () => {
  it("has the 15 modules of spec §292 in order with unique slugs", () => {
    expect(ACADEMY_MODULES).toHaveLength(15);
    expect(ACADEMY_MODULES.map((m) => m.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(new Set(ACADEMY_MODULES.map((m) => m.slug)).size).toBe(15);
    expect(getAcademyModule("what-is-xrpl")?.number).toBe(2);
  });

  it("each module is substantive and links to terminal tools", () => {
    for (const m of ACADEMY_MODULES) {
      const wc = moduleWordCount(m);
      expect(wc, m.slug).toBeGreaterThanOrEqual(390);
      expect(wc, m.slug).toBeLessThanOrEqual(750);
      expect(m.takeaways.length, m.slug).toBeGreaterThanOrEqual(3);
      expect(m.tools.length, m.slug).toBeGreaterThanOrEqual(1);
      for (const t of m.tools) expect(t.href.startsWith("/")).toBe(true);
    }
  });

  it("never promises profits", () => {
    const text = JSON.stringify(ACADEMY_MODULES).toLowerCase();
    for (const bad of ["guaranteed profit", "get rich", "risk-free profit", "100x", "to the moon"]) expect(text).not.toContain(bad);
  });
});

describe("auth helpers", () => {
  it("parses configured OAuth providers only", () => {
    expect(parseAuthProviders(undefined)).toEqual([]);
    expect(parseAuthProviders("google, GitHub ,twitter,google")).toEqual(["google", "github"]);
  });
  it("prevents open redirects", () => {
    expect(safeNextPath("/portfolio")).toBe("/portfolio");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
  it("enforces the password policy", () => {
    expect(passwordStrength("short1").unmet.length).toBeGreaterThan(0);
    expect(passwordStrength("longpasswordonly").unmet).toContain("A number");
    expect(passwordStrength("Longer-Passw0rd!").score).toBeGreaterThanOrEqual(3);
  });
});

describe("data export CSV", () => {
  it("flattens heterogeneous data losslessly and escapes values", () => {
    const csv = toLongCsv({ prefs: { theme: "dark", nested: { a: 1 } }, trades: [{ id: "t1", note: 'say "hi", ok' }] });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("dataset,record,field,value");
    expect(lines).toContain("prefs,0,theme,dark");
    expect(lines).toContain("prefs,0,nested.a,1");
    expect(lines).toContain('trades,0,note,"say ""hi"", ok"');
  });
});

describe("SEO", () => {
  it("sitemap lists public pages and academy modules, never private ones", () => {
    const urls = sitemap().map((u) => new URL(u.url).pathname);
    expect(urls).toContain("/pricing");
    expect(urls).toContain("/academy/backtesting");
    expect(urls.length).toBe(PUBLIC_PATHS.length + ACADEMY_MODULES.length);
    for (const p of DISALLOWED_PATHS) expect(urls.some((u) => u.startsWith(p))).toBe(false);
  });
  it("robots disallows the private terminal and API", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    for (const p of ["/dashboard", "/portfolio", "/settings", "/admin", "/alerts", "/trade-lab", "/api/"]) expect(rule.disallow).toContain(p);
  });
});
