import { describe, expect, it } from "vitest";
import { computeRegime } from "@/lib/analytics/regime";
import {
  STRATEGY_TEMPLATES,
  computeSignals,
  createStrategy,
  overfittingWarnings,
  regimeSeries,
  runBacktest,
  saveStrategyVersion,
  type StrategyRules,
} from "@/lib/tradelab/backtest";
import type { Candle } from "@/lib/types/market";

// Synthetic, deterministic fixture (tests only): a noisy sine wave with drift.
const DAY = 86_400_000;
const T0 = Date.UTC(2020, 0, 1);
function series(n: number, seed = 7): Candle[] {
  let x = seed;
  const rnd = () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
  const out: Candle[] = [];
  let prev = 1;
  for (let i = 0; i < n; i++) {
    const base = 1 + 0.3 * Math.sin(i / 25) + i * 0.0005;
    const c = base * (1 + (rnd() - 0.5) * 0.04);
    const o = prev;
    out.push({ t: T0 + i * DAY, o, h: Math.max(o, c) * (1 + rnd() * 0.01), l: Math.min(o, c) * (1 - rnd() * 0.01), c, v: 1000 + rnd() * 500 });
    prev = c;
  }
  return out;
}

const rsiRules: StrategyRules = STRATEGY_TEMPLATES[0].rules;
const smaRules: StrategyRules = {
  entry: { logic: "AND", conditions: [{ id: "a", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "crossAbove", right: { kind: "ind", ind: "SMA", period: 20 } }] },
  exit: { logic: "OR", conditions: [{ id: "b", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "crossBelow", right: { kind: "ind", ind: "SMA", period: 20 } }] },
  stopLossPct: 5,
  takeProfitPct: null,
  positionSizePct: 100,
};

describe("signals are causal (no lookahead)", () => {
  it("changing future bars does not change past signals", () => {
    const base = series(400);
    const k = 250;
    const mutated = base.map((c, i) => (i > k ? { ...c, o: c.o * 3, h: c.h * 3, l: c.l * 0.2, c: c.c * (i % 2 ? 3 : 0.2) } : c));
    for (const rules of [rsiRules, smaRules, STRATEGY_TEMPLATES[1].rules, STRATEGY_TEMPLATES[2].rules]) {
      const a = computeSignals(base, rules);
      const b = computeSignals(mutated, rules);
      expect(b.entry.slice(0, k + 1)).toEqual(a.entry.slice(0, k + 1));
      expect(b.exit.slice(0, k + 1)).toEqual(a.exit.slice(0, k + 1));
    }
  });

  it("signals on a truncated series equal the prefix of full-series signals", () => {
    const base = series(300);
    const full = computeSignals(base, smaRules);
    const part = computeSignals(base.slice(0, 200), smaRules);
    expect(part.entry).toEqual(full.entry.slice(0, 200));
  });

  it("backtest results up to T are unaffected by data after T", () => {
    const base = series(500);
    const to = base[300].t;
    const cfg = { from: base[100].t, to, capital: 100_000, feePct: 0.1, slippageBps: 5, timeframe: "1D" as const };
    const a = runBacktest(base, smaRules, cfg, { ranAt: 0 });
    const mutated = base.map((c, i) => (i > 300 ? { ...c, o: 99, h: 100, l: 0.01, c: 50 } : c));
    const b = runBacktest(mutated, smaRules, cfg, { ranAt: 0 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.lastT).toBe(to);
  });

  it("executes at the NEXT bar open after a signal at bar close", () => {
    const base = series(400);
    const cfg = { from: base[50].t, to: base[399].t, capital: 100_000, feePct: 0, slippageBps: 0, timeframe: "1D" as const };
    const r = runBacktest(base, smaRules, cfg, { ranAt: 0 });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.openedAt).toBeGreaterThan(t.entrySignalT);
      const bar = base.find((c) => c.t === t.openedAt)!;
      const prev = base[base.indexOf(bar) - 1];
      expect(prev.t).toBe(t.entrySignalT);
      expect(t.avgEntry).toBeCloseTo(bar.o, 10); // zero slippage → exactly the next open
    }
  });

  it("per-bar regime equals computeRegime on the data available at that bar", () => {
    const base = series(420);
    const reg = regimeSeries(base);
    for (const i of [219, 260, 333, 419]) expect(reg[i]).toBe(computeRegime(base.slice(0, i + 1)).regime);
    expect(reg[100]).toBeNull();
  });
});

describe("backtest accounting", () => {
  it("buy-and-hold benchmark uses same capital & period", () => {
    const base = series(300);
    const cfg = { from: base[50].t, to: base[299].t, capital: 50_000, feePct: 0.1, slippageBps: 5, timeframe: "1D" as const };
    const r = runBacktest(base, smaRules, cfg, { ranAt: 0 });
    const expected = ((50_000 * (1 - 0.001)) / base[50].o) * base[299].c;
    expect(r.equity[r.equity.length - 1].benchmark).toBeCloseTo(expected, 6);
    expect(r.benchmarkReturnPct).toBeCloseTo((expected / 50_000 - 1) * 100, 6);
  });

  it("final equity equals capital + sum of trade net P&L (flat at the end)", () => {
    const base = series(500);
    const r = runBacktest(base, rsiRules, { from: base[60].t, to: base[499].t, capital: 100_000, feePct: 0.1, slippageBps: 5, timeframe: "1D" }, { ranAt: 0 });
    const sum = r.trades.reduce((a, t) => a + t.netPnl, 0);
    expect(r.finalEquity).toBeCloseTo(100_000 + sum, 6);
  });

  it("stop is assumed before target when both are touched in one bar", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) candles.push({ t: T0 + i * DAY, o: 1, h: 1.001, l: 0.999, c: 1, v: 1 });
    // entry signal at bar 25 (price > 0.5 always true), fill at bar 26 open; bar 26 spans both SL & TP
    candles[26] = { t: T0 + 26 * DAY, o: 1, h: 1.2, l: 0.8, c: 1, v: 1 };
    const rules: StrategyRules = {
      entry: { logic: "AND", conditions: [{ id: "x", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "gt", right: { kind: "value", value: 0.5 } }] },
      exit: { logic: "OR", conditions: [] },
      stopLossPct: 5,
      takeProfitPct: 5,
      positionSizePct: 100,
    };
    const r = runBacktest(candles, rules, { from: candles[25].t, to: candles[29].t, capital: 10_000, feePct: 0, slippageBps: 0, timeframe: "1D" }, { ranAt: 0 });
    expect(r.trades[0].exitReason).toBe("STOP");
    expect(r.trades[0].avgExit).toBeCloseTo(0.95, 10);
    expect(r.trades[0].rMultiple).toBeCloseTo(-1, 6);
  });

  it("flags likely overfitting on tiny samples", () => {
    const base = series(120);
    const r = runBacktest(base, smaRules, { from: base[100].t, to: base[119].t, capital: 10_000, feePct: 0.1, slippageBps: 5, timeframe: "1D" }, { ranAt: 0 });
    const w = overfittingWarnings(r, smaRules, 12);
    expect(w.some((x) => /trade/.test(x))).toBe(true);
    expect(w.some((x) => /multiple-testing/.test(x))).toBe(true);
    expect(w[w.length - 1]).toMatch(/Past optimization does not guarantee future performance/);
  });
});

describe("strategy versioning", () => {
  it("changing rules creates a new version; identical rules keep it", () => {
    const s = createStrategy("s1", "Test", smaRules, 1);
    expect(s.version).toBe(1);
    expect(saveStrategyVersion(s, JSON.parse(JSON.stringify(smaRules)), 2)).toBe(s);
    const s2 = saveStrategyVersion(s, { ...smaRules, stopLossPct: 3 }, 3, "tighter stop");
    expect(s2.version).toBe(2);
    expect(s2.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(s2.versions[0].rules.stopLossPct).toBe(5);
  });
});
