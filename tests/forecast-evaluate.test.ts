import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/types/market";
import { assertNoLookahead, computeMetrics, forecastAllModelsAt, walkForward, type EvalRecord } from "@/lib/forecast/evaluate";
import { MODEL_NAME } from "@/lib/forecast/model";
import { mulberry32 } from "@/lib/forecast/stats";

function fixture(n = 1100, seed = 11): Candle[] {
  const r = mulberry32(seed);
  const out: Candle[] = [];
  let p = 0.5;
  const t0 = Date.UTC(2020, 0, 1);
  for (let i = 0; i < n; i++) {
    const z = (r() + r() + r() + r() - 2) * Math.sqrt(3);
    const o = p;
    p = p * Math.exp(0.04 * z);
    out.push({ t: t0 + i * 86_400_000, o, h: Math.max(o, p), l: Math.min(o, p), c: p, v: 1 });
  }
  return out;
}

const DAY = 86_400_000;

function rec(p: Partial<EvalRecord> & { actual: number; anchor: number }): EvalRecord {
  return { model: "m", asOf: 0, year: 2024, regime: "RANGE", p05: 80, p10: 85, p25: 95, p50: 100, p75: 105, p90: 115, p95: 120, ...p };
}

describe("walk-forward: no leakage", () => {
  const candles = fixture();

  it("forecast at as-of i is identical when data after i is altered", () => {
    const i = 700;
    const a = forecastAllModelsAt(candles, i, 30);
    const future = candles.map((c, j) => (j > i ? { ...c, c: c.c * 3 + 1, o: c.o * 3, h: c.h * 5, l: c.l } : c));
    const b = forecastAllModelsAt(future, i, 30);
    expect(b).toEqual(a);
    expect(a.bands.map((x) => x.model)).toContain(MODEL_NAME);
  });

  it("assertNoLookahead rejects a training slice that extends past the as-of date", () => {
    expect(() => assertNoLookahead(candles.slice(0, 501), candles[499].t)).toThrow(/Lookahead/);
    expect(() => assertNoLookahead(candles.slice(0, 500), candles[499].t)).not.toThrow();
  });

  it("per-as-of predictions do not depend on how much later history exists", () => {
    const full = walkForward(candles, 30);
    const cut = walkForward(candles.slice(0, candles.length - 7 * 17), 30); // as-of grid is anchored to the newest date; keep it aligned
    const byT = new Map(full.series.map((s) => [s.t, s]));
    let common = 0;
    for (const s of cut.series) {
      const f = byT.get(s.t);
      if (!f) continue;
      common++;
      expect(f.p50).toBe(s.p50);
      expect(f.p05).toBe(s.p05);
      expect(f.actual).toBe(s.actual);
    }
    expect(common).toBeGreaterThan(10);
  });

  it("every evaluated as-of respects min training, horizon and realised target", () => {
    const H = 30;
    const r = walkForward(candles, H);
    expect(r.nAsOf).toBeGreaterThan(50);
    const firstAllowed = candles[Math.max(365, H + 30)].t;
    for (const s of r.series) {
      expect(s.t).toBeGreaterThanOrEqual(firstAllowed);
      expect(s.target).toBe(s.t + H * DAY);
      expect(s.target).toBeLessThanOrEqual(candles[candles.length - 1].t);
    }
    // step = 7 days
    for (let k = 1; k < r.series.length; k++) expect(r.series[k].t - r.series[k - 1].t).toBe(7 * DAY);
    const main = r.models.find((m) => m.model === MODEL_NAME)!;
    expect(main.overall.n).toBe(r.nAsOf);
    expect(main.overall.nEffective).toBe(Math.round(r.nAsOf * (7 / 30)));
    expect(r.models.map((m) => m.model)).toEqual(expect.arrayContaining(["persistence", "ma20", "hist-median"]));
    expect(main.byYear.reduce((a, y) => a + y.metrics.n, 0)).toBe(main.overall.n);
    expect(main.byRegime.reduce((a, y) => a + y.metrics.n, 0)).toBe(main.overall.n);
  });
});

describe("metrics", () => {
  it("MAE / RMSE / MAPE / coverage / direction on a hand-made fixture", () => {
    const rs = [
      rec({ anchor: 100, actual: 110, p50: 100 }), // err −10, in 50? no (105) · in 90 yes
      rec({ anchor: 100, actual: 100, p50: 100 }), // err 0, in both
      rec({ anchor: 100, actual: 130, p50: 100 }), // err −30, outside both
      rec({ anchor: 100, actual: 90, p50: 102 }), //  err 12, in 90 only; direction predicted up, actual down
    ];
    const m = computeMetrics(rs, 7, 7);
    expect(m.n).toBe(4);
    expect(m.mae).toBeCloseTo((10 + 0 + 30 + 12) / 4, 10);
    expect(m.rmse).toBeCloseTo(Math.sqrt((100 + 0 + 900 + 144) / 4), 10);
    expect(m.mape).toBeCloseTo(((10 / 110 + 0 + 30 / 130 + 12 / 90) / 4) * 100, 10);
    expect(m.coverage50).toBeCloseTo(25, 10);
    expect(m.coverage90).toBeCloseTo(75, 10);
    expect(m.nDirectional).toBe(1); // only the last forecast made a directional call
    expect(m.directionalAccuracy).toBe(0);
    expect(m.smallSample).toBe(true);
    // calibration: share of outcomes ≤ P50 (=100/100/100/102) → 110 no, 100 yes, 130 no, 90 yes
    expect(m.calibration.find((c) => c.nominal === 0.5)!.empirical).toBeCloseTo(0.5, 10);
  });

  it("perfect coverage on a well-specified band", () => {
    const rs = Array.from({ length: 40 }, (_, i) => rec({ anchor: 100, actual: 96 + (i % 9), p50: 100 }));
    const m = computeMetrics(rs, 7, 7);
    expect(m.coverage90).toBe(100);
    expect(m.smallSample).toBe(false);
    expect(m.pinballPct).toBeGreaterThan(0);
  });

  it("effective N accounts for overlapping horizons", () => {
    const rs = Array.from({ length: 90 }, () => rec({ anchor: 100, actual: 100 }));
    expect(computeMetrics(rs, 90, 7).nEffective).toBe(7);
    expect(computeMetrics(rs, 90, 7).smallSample).toBe(true);
  });
});
