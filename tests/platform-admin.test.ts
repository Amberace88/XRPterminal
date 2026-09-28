import { describe, expect, it } from "vitest";
import { evaluateAdminAccess, isAdminPath, isAdminTable, redactSecrets, sanitizeSearch, summarizeAiUsage } from "@/lib/admin/guard";

describe("admin role guard", () => {
  it("requires configuration, a user, active status and the admin role", () => {
    expect(evaluateAdminAccess({ configured: false, userId: "u", role: "admin" })).toEqual({ ok: false, reason: "not_configured", status: 503 });
    expect(evaluateAdminAccess({ configured: true, userId: null, role: "admin" })).toMatchObject({ ok: false, reason: "unauthenticated", status: 401 });
    expect(evaluateAdminAccess({ configured: true, userId: "u", role: "user" })).toMatchObject({ ok: false, reason: "forbidden", status: 403 });
    expect(evaluateAdminAccess({ configured: true, userId: "u", role: null })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(evaluateAdminAccess({ configured: true, userId: "u", role: "admin", status: "suspended" })).toMatchObject({ ok: false, reason: "suspended" });
    expect(evaluateAdminAccess({ configured: true, userId: "u", role: "admin", status: "active" })).toEqual({ ok: true });
  });

  it("matches admin paths without false positives", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/settings")).toBe(false);
  });

  it("only allow-listed tables are readable", () => {
    expect(isAdminTable("audit_logs")).toBe(true);
    expect(isAdminTable("profiles")).toBe(false);
    expect(isAdminTable("connected_accounts")).toBe(false);
    expect(isAdminTable("constructor")).toBe(false);
  });

  it("never returns secret-like columns", () => {
    const r = redactSecrets({ id: 1, exchange: "kraken", api_key: "x", api_secret_encrypted: "y", iv: "z", auth_tag: "t", label: "main", access_token: "a" });
    expect(r).toEqual({ id: 1, exchange: "kraken", label: "main" });
  });

  it("sanitises PostgREST search input", () => {
    expect(sanitizeSearch("a%b_c,(d)*")).toBe("a b c  d");
    expect(sanitizeSearch("x".repeat(200)).length).toBe(80);
  });

  it("summarises AI usage tolerant of schema differences", () => {
    const s = summarizeAiUsage([
      { feature: "brief", input_tokens: 1_000_000, output_tokens: 100_000, latency_ms: 1000 },
      { feature: "brief", tokens_in: 0, tokens_out: 0, status: "error", latency_ms: 3000 },
      { kind: "claim_check", input_tokens: 0, output_tokens: 1_000_000 },
    ]);
    expect(s.requests).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.inputTokens).toBe(1_000_000);
    expect(s.outputTokens).toBe(1_100_000);
    expect(s.costIsEstimate).toBe(true);
    expect(s.estimatedCostUsd).toBeCloseTo(3 + 1.5 + 15, 2);
    expect(s.avgLatencyMs).toBe(2000);
    expect(s.byFeature[0]).toMatchObject({ feature: "brief", requests: 2 });
  });
});
