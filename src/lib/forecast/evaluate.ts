/**
 * Walk-forward evaluation (spec §63, §65, §206–209).
 *
 * For as-of dates stepping every `stepDays` (aligned to the most recent matured date) after a
 * minimum training window, each model is fit ONLY on candles[0..i] (enforced by slicing and a
 * runtime guard), predicts horizon H, and is compared with the realized close at as-of + H.
 * Nothing about the future enters the fit: no lookahead, no leakage.
 *
 * Metrics per model: MAE, RMSE, MAPE (median vs actual), directional accuracy, coverage of the
 * P25–P75 (nominal 50%), P10–P90 (80%) and P5–P95 (90%) bands, calibration (nominal quantile vs
 * empirical share of outcomes below it), mean pinball loss, N and an effective independent N.
 * Also broken down by regime (at the as-of date) and by calendar year — poor periods are shown.
 */
import type { Candle } from "@/lib/types/market";
import { computeRegime } from "@/lib/analytics/regime";
import { BASELINES, runBaselines } from "./baselines";
import { GATING_RULE } from "./horizons";
import { EVAL_PATHS, MODEL_NAME, MODEL_VERSION, scenarioBand } from "./model";
import { DAY_MS, isoDate } from "./stats";
import type { BandForecast } from "./types";

export const EVAL_STEP_DAYS = 7;
export const SMALL_N_THRESHOLD = 30;
const LEVELS: { q: number; key: keyof Omit<BandForecast, "model"> }[] = [
  { q: 0.05, key: "p05" },
  { q: 0.1, key: "p10" },
  { q: 0.25, key: "p25" },
  { q: 0.5, key: "p50" },
  { q: 0.75, key: "p75" },
  { q: 0.9, key: "p90" },
  { q: 0.95, key: "p95" },
];

export interface EvalRecord extends BandForecast {
  asOf: number;
  year: number;
  regime: string;
  anchor: number;
  actual: number;
}

export interface CalibrationPoint {
  nominal: number; // e.g. 0.25
  empirical: number | null; // share of outcomes ≤ the P-quantile
}

export interface Metrics {
  n: number;
  nEffective: number;
  smallSample: boolean;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  directionalAccuracy: number | null; // %
  nDirectional: number;
  coverage50: number | null; // %
  coverage80: number | null;
  coverage90: number | null;
  meanWidth50Pct: number | null;
  meanWidth90Pct: number | null;
  pinballPct: number | null; // mean quantile loss in % of anchor (lower is better)
  calibration: CalibrationPoint[];
}

export interface ModelEvaluation {
  model: string;
  label: string;
  kind: "model" | "baseline";
  overall: Metrics;
  byRegime: { key: string; metrics: Metrics }[];
  byYear: { key: string; metrics: Metrics }[];
}

export interface EvaluationReport {
  horizonDays: number;
  modelName: string;
  modelVersion: string;
  stepDays: number;
  minTrainDays: number;
  evalPaths: number;
  firstAsOf: string | null;
  lastAsOf: string | null;
  dataStart: string | null;
  dataEnd: string | null;
  nAsOf: number;
  models: ModelEvaluation[];
  /** Scenario-model forecast vs actual series (for charts). */
  series: { t: number; target: number; anchor: number; actual: number; p05: number; p25: number; p50: number; p75: number; p95: number; regime: string }[];
  poorPeriods: { key: string; reason: string; n: number }[];
  notes: string[];
  computedAt: number;
  computeMs: number;
}

/** Throws if any candle after `asOf` is present — the leakage guard used on every fit. */
export function assertNoLookahead(slice: Candle[], asOf: number): void {
  if (!slice.length) throw new Error("empty training slice");
  if (slice[slice.length - 1].t > asOf) throw new Error(`Lookahead detected: training slice ends ${isoDate(slice[slice.length - 1].t)} > as-of ${isoDate(asOf)}`);
}

/**
 * Forecast of every model as of index i, using ONLY candles[0..i].
 * Exported so tests can prove that mutating data after i leaves the output unchanged.
 */
export function forecastAllModelsAt(candles: Candle[], i: number, H: number, paths = EVAL_PATHS): { bands: BandForecast[]; regime: string } {
  const slice = candles.slice(0, i + 1);
  assertNoLookahead(slice, candles[i].t);
  const bands: BandForecast[] = [scenarioBand(slice, H, paths)];
  for (const b of runBaselines(slice, H)) if (b.available) bands.push({ model: b.model, p05: b.p05, p10: b.p10, p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90, p95: b.p95 });
  const regime = slice.length >= 220 ? computeRegime(slice).regime : "UNKNOWN";
  return { bands, regime };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeMetrics(records: EvalRecord[], H: number, stepDays = EVAL_STEP_DAYS): Metrics {
  const n = records.length;
  const nEffective = Math.max(n ? 1 : 0, Math.round(n * Math.min(1, stepDays / H)));
  const err = records.map((r) => r.p50 - r.actual);
  const dir = records.filter((r) => Math.abs(r.p50 / r.anchor - 1) > 0.001 && r.actual !== r.anchor);
  const within = (lo: keyof BandForecast, hi: keyof BandForecast) =>
    n ? (records.filter((r) => r.actual >= (r[lo] as number) && r.actual <= (r[hi] as number)).length / n) * 100 : null;
  const pinball = records.map((r) => {
    let s = 0;
    for (const { q, key } of LEVELS) {
      const pred = r[key] as number;
      const d = r.actual - pred;
      s += d >= 0 ? q * d : (q - 1) * d;
    }
    return (s / LEVELS.length / r.anchor) * 100;
  });
  return {
    n,
    nEffective,
    smallSample: nEffective < SMALL_N_THRESHOLD,
    mae: avg(err.map(Math.abs)),
    rmse: n ? Math.sqrt(avg(err.map((e) => e * e))!) : null,
    mape: avg(records.map((r) => (Math.abs(r.p50 - r.actual) / r.actual) * 100)),
    directionalAccuracy: dir.length ? (dir.filter((r) => Math.sign(r.p50 - r.anchor) === Math.sign(r.actual - r.anchor)).length / dir.length) * 100 : null,
    nDirectional: dir.length,
    coverage50: within("p25", "p75"),
    coverage80: within("p10", "p90"),
    coverage90: within("p05", "p95"),
    meanWidth50Pct: avg(records.map((r) => ((r.p75 - r.p25) / r.anchor) * 100)),
    meanWidth90Pct: avg(records.map((r) => ((r.p95 - r.p05) / r.anchor) * 100)),
    pinballPct: avg(pinball),
    calibration: LEVELS.map(({ q, key }) => ({ nominal: q, empirical: n ? records.filter((r) => r.actual <= (r[key] as number)).length / n : null })),
  };
}

function groupBy(records: EvalRecord[], key: (r: EvalRecord) => string): Map<string, EvalRecord[]> {
  const m = new Map<string, EvalRecord[]>();
  for (const r of records) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export interface WalkForwardOptions {
  stepDays?: number;
  minTrainDays?: number;
  paths?: number;
  /** Optional cap on as-of points (most recent kept) to bound compute. */
  maxPoints?: number;
}

/** Run the walk-forward test for horizon H over `candles` (ascending daily, completed). */
export function walkForward(candles: Candle[], H: number, opts: WalkForwardOptions = {}): EvaluationReport {
  const t0 = Date.now();
  const stepDays = opts.stepDays ?? EVAL_STEP_DAYS;
  const minTrainDays = opts.minTrainDays ?? GATING_RULE.minTrainDays;
  const paths = opts.paths ?? EVAL_PATHS;
  const n = candles.length;
  const idxByT = new Map<number, number>();
  candles.forEach((c, i) => idxByT.set(c.t, i));

  // as-of indices: newest matured first, stepping back; require min training + enough windows for baselines
  const start = Math.max(minTrainDays, H + 30);
  const asOfIdx: number[] = [];
  for (let i = n - 1 - H; i >= start; i -= stepDays) asOfIdx.push(i);
  if (opts.maxPoints && asOfIdx.length > opts.maxPoints) asOfIdx.length = opts.maxPoints;
  asOfIdx.reverse();

  const byModel = new Map<string, EvalRecord[]>();
  const series: EvaluationReport["series"] = [];
  for (const i of asOfIdx) {
    const asOf = candles[i].t;
    const j = idxByT.get(asOf + H * DAY_MS);
    if (j === undefined) continue; // gap in data at the target date — skip rather than interpolate
    const actual = candles[j].c;
    const anchor = candles[i].c;
    const { bands, regime } = forecastAllModelsAt(candles, i, H, paths);
    const year = new Date(asOf).getUTCFullYear();
    for (const b of bands) {
      const rec: EvalRecord = { ...b, asOf, year, regime, anchor, actual };
      const arr = byModel.get(b.model);
      if (arr) arr.push(rec);
      else byModel.set(b.model, [rec]);
      if (b.model === MODEL_NAME) series.push({ t: asOf, target: candles[j].t, anchor, actual, p05: b.p05, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95, regime });
    }
  }

  const labels: Record<string, { label: string; kind: "model" | "baseline" }> = { [MODEL_NAME]: { label: `${MODEL_NAME} v${MODEL_VERSION}`, kind: "model" } };
  for (const b of BASELINES) labels[b.id] = { label: b.label, kind: "baseline" };
  const order = [MODEL_NAME, ...BASELINES.map((b) => b.id)];
  const models: ModelEvaluation[] = order
    .filter((id) => byModel.has(id))
    .map((id) => {
      const recs = byModel.get(id)!;
      const regimes = [...groupBy(recs, (r) => r.regime).entries()].map(([key, rs]) => ({ key, metrics: computeMetrics(rs, H, stepDays) }));
      regimes.sort((a, b) => b.metrics.n - a.metrics.n);
      const years = [...groupBy(recs, (r) => String(r.year)).entries()].map(([key, rs]) => ({ key, metrics: computeMetrics(rs, H, stepDays) }));
      years.sort((a, b) => a.key.localeCompare(b.key));
      return { model: id, label: labels[id]?.label ?? id, kind: labels[id]?.kind ?? "baseline", overall: computeMetrics(recs, H, stepDays), byRegime: regimes, byYear: years };
    });

  // Poor periods for the scenario model (spec §207 "never hide poor periods")
  const poorPeriods: EvaluationReport["poorPeriods"] = [];
  const main = models.find((m) => m.model === MODEL_NAME);
  if (main) {
    const overallMape = main.overall.mape ?? 0;
    for (const y of main.byYear) {
      const m = y.metrics;
      if (m.n < 4) continue;
      const reasons: string[] = [];
      if (m.coverage90 !== null && m.coverage90 < 75) reasons.push(`P5–P95 coverage only ${m.coverage90.toFixed(0)}% (nominal 90%)`);
      if (m.coverage50 !== null && m.coverage50 < 30) reasons.push(`P25–P75 coverage only ${m.coverage50.toFixed(0)}% (nominal 50%)`);
      if (m.mape !== null && overallMape > 0 && m.mape > overallMape * 1.5) reasons.push(`MAPE ${m.mape.toFixed(1)}% vs ${overallMape.toFixed(1)}% overall`);
      if (reasons.length) poorPeriods.push({ key: y.key, reason: reasons.join("; "), n: m.n });
    }
    for (const r of main.byRegime) {
      const m = r.metrics;
      if (m.n < 4) continue;
      if (m.coverage90 !== null && m.coverage90 < 75) poorPeriods.push({ key: `Regime: ${r.key}`, reason: `P5–P95 coverage only ${m.coverage90.toFixed(0)}% (nominal 90%)`, n: m.n });
    }
  }

  const notes = [
    `As-of dates every ${stepDays} days after a ${minTrainDays}-day minimum training window; each fit uses only data up to its as-of date.`,
    `Evaluation uses ${paths} simulated paths per as-of date (the live forecast uses more); quantile estimates therefore carry slightly more Monte-Carlo noise here.`,
    H > stepDays
      ? `Consecutive ${H}-day outcomes overlap (step ${stepDays}d < horizon), so they are correlated: effective independent N ≈ N × ${stepDays}/${H}.`
      : "Outcomes do not overlap at this horizon.",
    "Directional accuracy only counts forecasts whose median differs from the anchor by >0.1%; naive persistence makes no directional call.",
    "Regime labels are computed at each as-of date from data up to that date.",
  ];

  return {
    horizonDays: H,
    modelName: MODEL_NAME,
    modelVersion: MODEL_VERSION,
    stepDays,
    minTrainDays,
    evalPaths: paths,
    firstAsOf: series.length ? isoDate(series[0].t) : null,
    lastAsOf: series.length ? isoDate(series[series.length - 1].t) : null,
    dataStart: n ? isoDate(candles[0].t) : null,
    dataEnd: n ? isoDate(candles[n - 1].t) : null,
    nAsOf: series.length,
    models,
    series,
    poorPeriods,
    notes,
    computedAt: Date.now(),
    computeMs: Date.now() - t0,
  };
}
