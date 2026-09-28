import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/types/market";
import { runScenarioModel, MODEL_VERSION } from "@/lib/forecast/model";
import { canonicalJson, contentHash, evaluateForecastRow, payloadHash, sha256Hex, toForecastRow } from "@/lib/forecast/record";
import { compareForecasts, snapshotOf } from "@/lib/forecast/changes";
import { completedDaily, mulberry32 } from "@/lib/forecast/stats";
import { MODEL_CHANGELOG, MODEL_REGISTRY } from "@/lib/forecast/registry";
import { readFileSync } from "node:fs";
import path from "node:path";

function fixture(n = 1000, seed = 3): Candle[] {
  const r = mulberry32(seed);
  const out: Candle[] = [];
  let p = 1;
  const t0 = Date.UTC(2021, 0, 1);
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * Math.exp(0.035 * (r() + r() + r() - 1.5) * 2);
    out.push({ t: t0 + i * 86_400_000, o, h: Math.max(o, p), l: Math.min(o, p), c: p, v: 1 });
  }
  return out;
}

const candles = fixture();
const f = runScenarioModel(candles, { horizonDays: 30, computedAt: 1, dataProvider: "fixture" });

describe("immutable forecast records", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 0.1 + 0.2 } })).toBe(canonicalJson({ a: { c: 0.30000000000000004, d: [1, 2] }, b: 1 }));
  });

  it("sha256 matches a known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("content hash (identity) and payload hash are stable across re-computation", async () => {
    const g = runScenarioModel(candles, { horizonDays: 30, computedAt: 999, dataProvider: "fixture" });
    expect(await contentHash(g)).toBe(await contentHash(f));
    expect(await payloadHash(g)).toBe(await payloadHash(f)); // computedAt is not part of the payload
    const row = await toForecastRow(f);
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.training_end).toBe(row.as_of.slice(0, 10));
    expect(row.model_version).toBe(MODEL_VERSION);
  });

  it("new version / horizon / date ⇒ new identity (never an overwrite)", async () => {
    const base = await contentHash(f);
    expect(await contentHash({ ...f, modelVersion: "1.0.1" })).not.toBe(base);
    expect(await contentHash({ ...f, horizonDays: 90 })).not.toBe(base);
    const earlier = runScenarioModel(candles.slice(0, -1), { horizonDays: 30, computedAt: 1, dataProvider: "fixture" });
    expect(await contentHash(earlier)).not.toBe(base);
  });

  it("payload hash detects tampering", async () => {
    const tampered = { ...f, quantiles: { ...f.quantiles, p50: f.quantiles.p50 * 1.01 } };
    expect(await payloadHash(tampered)).not.toBe(await payloadHash(f));
  });

  it("migration makes forecasts and evaluations append-only", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/0030_forecast.sql"), "utf8");
    expect(sql).toMatch(/forecasts_immutable before update or delete on public\.forecasts/);
    expect(sql).toMatch(/forecast_evaluations_immutable before update or delete on public\.forecast_evaluations/);
    expect(sql).toMatch(/content_hash text not null unique/);
    expect(sql).not.toMatch(/for (insert|update|delete) to (anon|authenticated)/);
  });

  it("registry and changelog reference the current model version", () => {
    expect(MODEL_REGISTRY[0].version).toBe(MODEL_VERSION);
    expect(MODEL_CHANGELOG.some((c) => c.newVersion === MODEL_VERSION)).toBe(true);
  });
});

describe("actual evaluation", () => {
  it("scores a matured forecast deterministically", async () => {
    const row = { ...(await toForecastRow(f)), id: "x" };
    const q = f.quantiles;
    const inside = evaluateForecastRow(row, q.p50, "fixture");
    expect(inside.in_p25_p75).toBe(true);
    expect(inside.in_p5_p95).toBe(true);
    expect(inside.error).toBe(0);
    const outside = evaluateForecastRow(row, q.p99 * 1.5, "fixture");
    expect(outside.in_p5_p95).toBe(false);
    expect(outside.abs_pct_error).toBeCloseTo((Math.abs(q.p50 - q.p99 * 1.5) / (q.p99 * 1.5)) * 100, 10);
  });

  it("uses only completed daily candles", () => {
    const now = candles[candles.length - 1].t + 3600_000; // last candle still in progress
    expect(completedDaily(candles, now).length).toBe(candles.length - 1);
    expect(completedDaily(candles, now + 86_400_000).length).toBe(candles.length);
  });
});

describe("what changed", () => {
  it("reports no material change against itself", () => {
    const w = compareForecasts(snapshotOf(f), snapshotOf(f));
    expect(w.items.every((i) => !i.changed || i.kind === "inputs")).toBe(true);
    expect(w.items.find((i) => i.kind === "model_version")!.changed).toBe(false);
  });

  it("detects regime, version and range changes with explanations", () => {
    const prev = snapshotOf(runScenarioModel(candles.slice(0, -7), { horizonDays: 30, computedAt: 1 }));
    const cur = snapshotOf(f);
    const w = compareForecasts({ ...prev, modelVersion: "0.9.0", inputs: { ...prev.inputs, regime: "RANGE" } }, { ...cur, inputs: { ...cur.inputs, regime: "HIGH VOLATILITY" } });
    const byKind = Object.fromEntries(w.items.map((i) => [i.kind, i]));
    expect(byKind.regime.changed).toBe(true);
    expect(byKind.model_version.changed).toBe(true);
    expect(byKind.range.before).not.toBe(byKind.range.after);
    for (const i of w.items) expect(i.explanation.length).toBeGreaterThan(5);
    expect(w.summary).toMatch(/changed/);
  });
});
