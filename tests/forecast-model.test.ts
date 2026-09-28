import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/types/market";
import { MODEL_NAME, MODEL_VERSION, modelSeed, runScenarioModel, scenarioBand } from "@/lib/forecast/model";
import { allHorizonStatuses, horizonStatus } from "@/lib/forecast/horizons";
import { runBaselines } from "@/lib/forecast/baselines";
import { mulberry32 } from "@/lib/forecast/stats";
import { QUANTILE_KEYS } from "@/lib/forecast/types";

/** Synthetic daily fixture with volatility clustering (development fixture — tests only). */
function fixture(n = 1600, seed = 7, volBoostLastDays = 0): Candle[] {
  const r = mulberry32(seed);
  const out: Candle[] = [];
  let p = 0.3;
  let v = 0.045;
  const t0 = Date.UTC(2019, 0, 1);
  for (let i = 0; i < n; i++) {
    v = Math.max(0.01, Math.min(0.15, v * 0.97 + 0.03 * 0.045 + (r() - 0.5) * 0.01));
    const z = (r() + r() + r() + r() - 2) * Math.sqrt(3);
    const boost = i >= n - volBoostLastDays ? 3 : 1;
    const o = p;
    p = p * Math.exp(0.0003 + v * boost * z);
    out.push({ t: t0 + i * 86_400_000, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1e6 });
  }
  return out;
}

const T = 1_700_000_000_000;

describe("xrpt-scenario model", () => {
  const candles = fixture();

  it("is deterministic: same inputs → identical outputs", () => {
    const a = runScenarioModel(candles, { horizonDays: 30, computedAt: T, dataProvider: "fixture" });
    const b = runScenarioModel(candles.map((c) => ({ ...c })), { horizonDays: 30, computedAt: T, dataProvider: "fixture" });
    expect(b).toEqual(a);
    expect(a.modelName).toBe(MODEL_NAME);
    expect(a.modelVersion).toBe(MODEL_VERSION);
  });

  it("seed is derived from as-of date + horizon", () => {
    expect(modelSeed("2026-09-27", 30)).toBe(modelSeed("2026-09-27", 30));
    expect(modelSeed("2026-09-27", 30)).not.toBe(modelSeed("2026-09-26", 30));
    expect(modelSeed("2026-09-27", 30)).not.toBe(modelSeed("2026-09-27", 90));
  });

  it("produces strictly ordered quantiles and contiguous scenario ranges — never a single target", () => {
    for (const h of [7, 30, 90, 180, 365]) {
      const f = runScenarioModel(candles, { horizonDays: h, computedAt: T });
      const qs = QUANTILE_KEYS.map((k) => f.quantiles[k]);
      for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeGreaterThan(qs[i - 1]);
      const [bear, base, bull, extreme] = f.scenarios;
      expect(bear.kind).toBe("BEAR");
      expect(bear.range.low).toBeCloseTo(f.quantiles.p05, 12);
      expect(bear.range.high).toBeCloseTo(base.range.low, 12);
      expect(base.range.high).toBeCloseTo(bull.range.low, 12);
      expect(bull.range.high).toBeCloseTo(f.quantiles.p95, 12);
      expect(extreme.tails!.lower.high).toBeCloseTo(f.quantiles.p05, 12);
      expect(extreme.tails!.upper.low).toBeCloseTo(f.quantiles.p95, 12);
      for (const s of f.scenarios) {
        expect(s.range.high).toBeGreaterThan(s.range.low);
        expect(s.invalidation.length).toBeGreaterThanOrEqual(5);
        expect(s.lessApplicableIf.length).toBeGreaterThan(0);
        expect(s.assumptions.length).toBeGreaterThan(0);
        expect(s.drivers.length).toBeGreaterThan(0);
      }
      // fan: ordered per day, ends at the horizon
      for (const p of f.fan) expect(p.p05 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95).toBe(true);
      expect(f.fan[f.fan.length - 1].t).toBe(f.asOf + h * 86_400_000);
      expect(f.trainingEnd).toBe(f.asOfDate);
    }
  });

  it("bands widen with horizon", () => {
    const w = [7, 30, 90, 365].map((h) => runScenarioModel(candles, { horizonDays: h, computedAt: T }).uncertainty.bandWidth90Pct);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
  });

  it("scales volatility to the current regime (clamped)", () => {
    const calm = runScenarioModel(fixture(1600, 7, 0), { horizonDays: 30, computedAt: T });
    const stormy = runScenarioModel(fixture(1600, 7, 30), { horizonDays: 30, computedAt: T });
    expect(stormy.inputs.volScaleApplied).toBeGreaterThan(calm.inputs.volScaleApplied);
    expect(stormy.inputs.volScaleApplied).toBeLessThanOrEqual(2);
    expect(stormy.uncertainty.bandWidth90Pct).toBeGreaterThan(calm.uncertainty.bandWidth90Pct);
  });

  it("uses no data after the as-of date (mutating the future leaves the forecast unchanged)", () => {
    const i = 1200;
    const base = runScenarioModel(candles.slice(0, i + 1), { horizonDays: 30, computedAt: T });
    const mutated = candles.map((c, j) => (j > i ? { ...c, c: c.c * 10, h: c.h * 10, l: c.l * 10, o: c.o * 10 } : c));
    const again = runScenarioModel(mutated.slice(0, i + 1), { horizonDays: 30, computedAt: T });
    expect(again).toEqual(base);
    expect(scenarioBand(mutated.slice(0, i + 1), 30)).toEqual(scenarioBand(candles.slice(0, i + 1), 30));
  });

  it("rejects insufficient history", () => {
    expect(() => runScenarioModel(candles.slice(0, 100), { horizonDays: 7 })).toThrow();
  });
});

describe("horizon gating rule", () => {
  it("≈3,500 days → 7D/30D/90D enabled, 180D/1Y low sample, 3Y/5Y disabled", () => {
    const s = Object.fromEntries(allHorizonStatuses(3500).map((h) => [h.key, h.status]));
    expect(s).toEqual({ "7D": "enabled", "30D": "enabled", "90D": "enabled", "180D": "low_sample", "1Y": "low_sample", "3Y": "disabled", "5Y": "disabled" });
  });

  it("is driven by the count of independent windows", () => {
    const h = horizonStatus(3500, 1095);
    expect(h.independentWindows).toBe(3);
    expect(h.reason).toMatch(/not enough independent history/);
    expect(horizonStatus(800, 90).status).toBe("disabled"); // 8 windows but only 3 walk-forward outcomes
    expect(horizonStatus(1000, 30).status).toBe("enabled");
    expect(horizonStatus(600, 30).status).toBe("low_sample");
  });
});

describe("baselines", () => {
  const candles = fixture();
  const last = candles[candles.length - 1].c;
  it("persistence median = last close, MA median = SMA20, bands ordered", () => {
    const b = Object.fromEntries(runBaselines(candles, 30).map((x) => [x.model, x]));
    expect(b.persistence.p50).toBeCloseTo(last, 12);
    const sma20 = candles.slice(-20).reduce((a, c) => a + c.c, 0) / 20;
    expect(b.ma20.p50).toBeCloseTo(sma20, 12);
    for (const x of Object.values(b)) {
      if (!x.available) continue;
      expect(x.p05).toBeLessThan(x.p25);
      expect(x.p25).toBeLessThanOrEqual(x.p50);
      expect(x.p50).toBeLessThanOrEqual(x.p75);
      expect(x.p75).toBeLessThan(x.p95);
    }
  });
  it("marks baselines unavailable when history is too short", () => {
    const b = runBaselines(candles.slice(0, 50), 30);
    expect(b.find((x) => x.model === "persistence")!.available).toBe(false);
  });
});
