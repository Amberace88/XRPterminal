import { describe, expect, it } from "vitest";
import { aggregate, evaluateRule, gate, initialEngineState, runTick, DEDUPE_WINDOW_MS } from "@/lib/alerts/engine";
import { extractForecastRange, parseStreamTx } from "@/lib/alerts/inputs";
import { planErrors, validateRule } from "@/lib/alerts/schema";
import type { AlertCondition, AlertRule, EvalContext } from "@/lib/alerts/types";

const T0 = Date.UTC(2026, 8, 28, 10);
const MIN = 60_000;
function rule(id: string, conditions: AlertCondition[], extra: Partial<AlertRule> = {}): AlertRule {
  return { id, name: `Rule ${id}`, conditions, priority: "normal", cooldownMin: 30, channels: { inApp: true, push: false, email: false }, enabled: true, createdAt: 0, updatedAt: 0, lastTriggeredAt: null, triggerCount: 0, ...extra };
}
const ctx = (c: Partial<EvalContext>): EvalContext => ({ now: T0, ...c });

describe("alert evaluation", () => {
  it("fires level conditions on the rising edge only", () => {
    const r = rule("p", [{ type: "price_above", value: 1 }]);
    let s = initialEngineState();
    let res = runTick([r], ctx({ price: 0.9 }), s);
    expect(res.fired).toHaveLength(0);
    res = runTick([r], ctx({ now: T0 + MIN, price: 1.05 }), res.state);
    expect(res.fired).toHaveLength(1);
    res = runTick([r], ctx({ now: T0 + 2 * MIN, price: 1.1 }), res.state);
    expect(res.fired).toHaveLength(0); // still above → no repeat
    s = res.state;
    res = runTick([r], ctx({ now: T0 + 3 * MIN, price: 0.95 }), s);
    res = runTick([r], ctx({ now: T0 + 4 * MIN, price: 1.2 }), res.state);
    expect(res.fired).toHaveLength(0);
    expect(res.suppressed[0].reason).toBe("cooldown"); // re-cross within 30 min cooldown
  });

  it("skips rules whose data is unavailable (never fires on missing data)", () => {
    const r = rule("v", [{ type: "volatility_above", value: 10 }]);
    const res = runTick([r], ctx({ price: 1 }), initialEngineState());
    expect(res.fired).toHaveLength(0);
    expect(evaluateRule(r, ctx({})).evaluable).toBe(false);
  });

  it("AND logic: all conditions must hold (event + level)", () => {
    const r = rule("smart", [
      { type: "volatility_above", value: 80 },
      { type: "regime_change", to: "ANY" },
    ]);
    expect(runTick([r], ctx({ vol30Pct: 90, regime: "RANGE", prevRegime: "RANGE" }), initialEngineState()).fired).toHaveLength(0);
    expect(runTick([r], ctx({ vol30Pct: 50, regime: "HIGH VOLATILITY", prevRegime: "RANGE" }), initialEngineState()).fired).toHaveLength(0);
    const hit = runTick([r], ctx({ vol30Pct: 90, regime: "HIGH VOLATILITY", prevRegime: "RANGE" }), initialEngineState());
    expect(hit.fired).toHaveLength(1);
    expect(hit.fired[0].body).toContain("RANGE → HIGH VOLATILITY");
  });

  it("dedupes the same event (e.g. same tx hash) even after cooldown", () => {
    const r = rule("w", [{ type: "whale_tx", minXrp: 1_000_000 }], { cooldownMin: 1 });
    const tx = { hash: "H1", account: "rA", destination: "rB", amountXrp: 5_000_000, type: "Payment", time: T0 };
    let res = runTick([r], ctx({ whaleTxs: [tx] }), initialEngineState());
    expect(res.fired).toHaveLength(1);
    res = runTick([r], ctx({ now: T0 + 10 * MIN, whaleTxs: [tx] }), res.state);
    expect(res.fired).toHaveLength(0);
    expect(res.suppressed[0].reason).toBe("duplicate");
    const tx2 = { ...tx, hash: "H2" };
    res = runTick([r], ctx({ now: T0 + 11 * MIN, whaleTxs: [tx2] }), res.state);
    expect(res.fired).toHaveLength(1);
  });

  it("enforces the daily limit, but critical alerts bypass it", () => {
    const rules = [rule("a", [{ type: "price_above", value: 1 }]), rule("b", [{ type: "price_below", value: 2 }]), rule("c", [{ type: "change_24h", value: 1, direction: "either" }], { priority: "critical" })];
    const res = runTick(rules, ctx({ price: 1.5, changePct24h: 5 }), initialEngineState(), { dailyLimit: 1 });
    expect(res.fired.map((f) => f.ruleId).sort()).toEqual(["a", "c"]);
    expect(res.suppressed.find((s) => s.ruleId === "b")?.reason).toBe("daily_limit");
  });

  it("gate: critical uses a 1-minute minimum cooldown; dedupe expires after 24h", () => {
    const s = { ...initialEngineState(), lastFired: { r: T0 }, dedupe: { k: T0 } };
    expect(gate({ id: "r", cooldownMin: 60, priority: "critical" }, "x", s, T0 + 2 * MIN, 10)).toEqual({ allow: true });
    expect(gate({ id: "r", cooldownMin: 60, priority: "normal" }, "x", s, T0 + 2 * MIN, 10)).toEqual({ allow: false, reason: "cooldown" });
    expect(gate({ id: "q", cooldownMin: 1, priority: "normal" }, "k", s, T0 + DEDUPE_WINDOW_MS + 1, 10)).toEqual({ allow: true });
  });

  it("aggregates bursts of non-critical alerts", () => {
    const f = (id: string, priority: "normal" | "critical" = "normal") => ({ ruleId: id, ruleName: id, priority, dedupeKey: id, details: [], title: id, body: "" });
    const n = aggregate([f("1"), f("2"), f("3"), f("4"), f("5", "critical")], 3, T0);
    expect(n).toHaveLength(2);
    expect(n.find((x) => x.aggregated)?.title).toBe("4 alerts triggered");
    expect(n.find((x) => !x.aggregated)?.priority).toBe("critical");
    expect(aggregate([f("1"), f("2")], 3, T0)).toHaveLength(2);
  });

  it("matches wallet direction, news keywords/categories and forecast shifts", () => {
    const addr = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
    const w = rule("w", [{ type: "wallet_activity", address: addr, direction: "received", minXrp: 100 }]);
    const tx = { hash: "T", account: "rX", destination: addr, amountXrp: 500, type: "Payment", time: T0 };
    expect(evaluateRule(w, ctx({ walletTxs: [tx] })).met).toBe(true);
    expect(evaluateRule(w, ctx({ walletTxs: [{ ...tx, account: addr, destination: "rX" }] })).met).toBe(false);
    const n = rule("n", [{ type: "news", keywords: ["rlusd"], categories: ["REGULATION"] }]);
    expect(evaluateRule(n, ctx({ news: [{ id: "1", title: "RLUSD grows", categories: ["RLUSD"], url: "u", source: "s" }] })).met).toBe(true);
    expect(evaluateRule(n, ctx({ news: [{ id: "2", title: "Court ruling", categories: ["REGULATION"], url: "u", source: "s" }] })).met).toBe(true);
    expect(evaluateRule(n, ctx({ news: [{ id: "3", title: "BTC rallies", categories: ["MARKET"], url: "u", source: "s" }] })).met).toBe(false);
    const fc = rule("f", [{ type: "forecast_change", minShiftPct: 5 }]);
    expect(evaluateRule(fc, ctx({ forecast: { previous: { low: 1, high: 2 }, current: { low: 1.1, high: 2.2 } } })).met).toBe(true);
    expect(evaluateRule(fc, ctx({ forecast: { previous: { low: 1, high: 2 }, current: { low: 1.01, high: 2.01 } } })).met).toBe(false);
  });
});

describe("alert inputs & validation", () => {
  it("parses validated XRP payments from the XRPL stream", () => {
    const ev = parseStreamTx({ type: "transaction", validated: true, hash: "ABC", transaction: { TransactionType: "Payment", Account: "rA", Destination: "rB", Amount: "2500000000", date: 0 }, meta: { TransactionResult: "tesSUCCESS", delivered_amount: "2500000000" } });
    expect(ev?.amountXrp).toBe(2500);
    expect(parseStreamTx({ type: "transaction", transaction: { TransactionType: "Payment", Amount: { value: "1", currency: "USD" } }, meta: { TransactionResult: "tesSUCCESS", delivered_amount: { value: "1" } }, hash: "X" })).toBeNull();
    expect(parseStreamTx({ type: "ledgerClosed" })).toBeNull();
  });
  it("extracts forecast ranges from varied shapes", () => {
    expect(extractForecastRange({ low: 1, high: 2 })).toEqual({ low: 1, high: 2 });
    expect(extractForecastRange({ forecast: { horizons: [{ p05: 0.4, p95: 0.9 }] } })).toEqual({ low: 0.4, high: 0.9 });
    expect(extractForecastRange({ forecast: { quantiles: { p01: 0.3, p05: 0.45, p50: 0.6, p95: 0.8 } }, horizons: [{ days: 30 }] })).toEqual({ low: 0.45, high: 0.8 });
    expect(extractForecastRange({ nothing: true })).toBeNull();
  });
  it("validates rules and plan limits", () => {
    expect(validateRule({ name: "x", conditions: [], priority: "normal", cooldownMin: 5, channels: { inApp: true, push: false, email: false }, enabled: true }).ok).toBe(false);
    const good = validateRule({ name: "Above $1", conditions: [{ type: "price_above", value: 1 }], priority: "normal", cooldownMin: 5, channels: { inApp: true, push: false, email: false }, enabled: true });
    expect(good.ok).toBe(true);
    expect(planErrors({ conditions: [{ type: "price_above", value: 1 }, { type: "volume_above", value: 5 }] }, "pro", 0, true)).toContain("Multi-condition (AND) smart alerts require Pro+.");
    expect(planErrors({ conditions: [{ type: "price_above", value: 1 }] }, "free", 5, true)[0]).toMatch(/allows 5/);
    expect(planErrors({ conditions: [{ type: "regime_change", to: "ANY" }] }, "free", 0, true)).toHaveLength(1);
    expect(planErrors({ conditions: [{ type: "regime_change", to: "ANY" }, { type: "price_above", value: 1 }] }, "proplus", 10, true)).toHaveLength(0);
  });
});
