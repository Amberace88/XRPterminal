/**
 * Model "xrpt-scenario" v1.0.0 — deterministic stationary block bootstrap (spec §56–59).
 *
 * Method
 *  1. Training sample = trailing `trainingWindowDays` daily log returns ending at the as-of date
 *     (the caller passes candles ≤ as-of only; the model never sees anything later).
 *  2. Returns are DEMEANED: the model does not extrapolate the historical drift (XRP's 2017 bubble
 *     would otherwise dominate). The median path is therefore ~flat; direction is not forecast.
 *  3. Stationary bootstrap (Politis & Romano 1994): paths are stitched from blocks of consecutive
 *     historical returns with geometric block lengths (mean `blockLength` days), preserving
 *     volatility clustering and short-range autocorrelation.
 *  4. Volatility scaling: sampled returns are multiplied by s(t) = 1 + (k − 1)·e^(−t/τ), where
 *     k = current 30D vol ÷ training-window vol, clamped to [0.5, 2.0], τ = 30 days — current
 *     conditions matter most near-term and mean-revert toward the historical level.
 *  5. A seeded PRNG (seed = hash(model, version, as-of date, horizon)) makes the output a pure
 *     function of its inputs: same data + same horizon ⇒ identical quantiles.
 *
 * Output: terminal-price quantiles P1…P99, a per-day fan, BEAR/BASE/BULL/EXTREME scenario ranges.
 * NEVER a single price target.
 */
import type { Candle } from "@/lib/types/market";
import { buildContext, computeInputs } from "./features";
import { horizonByDays, horizonStatus } from "./horizons";
import { buildScenarios, modelAssumptions, modelLimitations } from "./scenarios";
import { DAY_MS, hashString, isoDate, mulberry32, quantileSorted } from "./stats";
import type { BandForecast, FanPoint, ForecastOutput, ModelParameters, Quantiles } from "./types";
import { QUANTILE_KEYS, QUANTILE_LEVELS } from "./types";

export const MODEL_NAME = "xrpt-scenario";
export const MODEL_VERSION = "1.0.0";

export const DEFAULT_PARAMS = {
  blockLength: 10,
  paths: 4000,
  trainingWindowDays: 1460,
  volScaling: true,
  volClamp: [0.5, 2.0] as [number, number],
  volDecayDays: 30,
  demeaned: true,
} as const;

/** Paths used inside walk-forward evaluation (bounded compute; documented in methodology). */
export const EVAL_PATHS = 600;
/** Minimum daily candles required to run the model at all. */
export const MIN_HISTORY_DAYS = 365;

export function modelSeed(asOfDate: string, horizonDays: number): number {
  return hashString(`${MODEL_NAME}|${MODEL_VERSION}|${asOfDate}|${horizonDays}`) % 4294967296;
}

interface SimResult {
  terminal: Float64Array; // sorted log-returns at horizon
  fan: { day: number; sorted: Float64Array }[];
}

/**
 * Core simulation. `r` must be demeaned (or not) by the caller. Returns cumulative log-returns.
 * Pure: depends only on its arguments.
 */
export function simulatePaths(
  r: Float64Array,
  horizonDays: number,
  paths: number,
  blockLength: number,
  seed: number,
  volScale0: number,
  volDecayDays: number,
  fanDays: number[] = [],
): SimResult {
  const m = r.length;
  const rng = mulberry32(seed);
  const p = 1 / blockLength;
  const scale = new Float64Array(horizonDays);
  for (let t = 0; t < horizonDays; t++) scale[t] = 1 + (volScale0 - 1) * Math.exp(-t / volDecayDays);
  const terminal = new Float64Array(paths);
  const fanIdx = new Int32Array(horizonDays + 1).fill(-1);
  fanDays.forEach((d, i) => {
    if (d >= 1 && d <= horizonDays) fanIdx[d] = i;
  });
  const fanBuf = fanDays.map(() => new Float64Array(paths));
  for (let k = 0; k < paths; k++) {
    let idx = Math.floor(rng() * m);
    let acc = 0;
    for (let t = 0; t < horizonDays; t++) {
      if (t > 0) {
        if (rng() < p) idx = Math.floor(rng() * m);
        else idx = idx + 1 === m ? 0 : idx + 1; // circular wrap (standard for the stationary bootstrap)
      }
      acc += r[idx] * scale[t];
      const f = fanIdx[t + 1];
      if (f >= 0) fanBuf[f][k] = acc;
    }
    terminal[k] = acc;
  }
  terminal.sort();
  return { terminal, fan: fanDays.map((day, i) => ({ day, sorted: fanBuf[i].sort() })) };
}

function prepareReturns(train: Float64Array, demean: boolean): Float64Array {
  const out = Float64Array.from(train);
  if (!demean) return out;
  let s = 0;
  for (let i = 0; i < out.length; i++) s += out[i];
  const mu = s / out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mu;
  return out;
}

function fanSchedule(h: number): number[] {
  if (h <= 120) return Array.from({ length: h }, (_, i) => i + 1);
  const step = Math.ceil(h / 120);
  const days: number[] = [];
  for (let d = step; d < h; d += step) days.push(d);
  days.push(h);
  return days;
}

export interface RunOptions {
  horizonDays: number;
  paths?: number;
  withFan?: boolean;
  btc?: Candle[] | null;
  asset?: string;
  dataProvider?: string;
  /** Length of the FULL history (for horizon gating). Defaults to candles.length. */
  historyDaysForGating?: number;
  computedAt?: number;
}

/**
 * Run the scenario model on `candles` (ascending, daily, completed; last = as-of).
 * The function only reads `candles` — pass `history.slice(0, i + 1)` to forecast as-of index i.
 */
export function runScenarioModel(candles: Candle[], opts: RunOptions): ForecastOutput {
  if (candles.length < MIN_HISTORY_DAYS) throw new Error(`Need at least ${MIN_HISTORY_DAYS} daily candles (have ${candles.length}).`);
  const H = opts.horizonDays;
  const paths = opts.paths ?? DEFAULT_PARAMS.paths;
  const last = candles[candles.length - 1];
  const asOfDate = isoDate(last.t);
  const seed = modelSeed(asOfDate, H);
  const ctx = buildContext(candles, DEFAULT_PARAMS.trainingWindowDays);
  const inputs = computeInputs(candles, ctx, { horizonDays: H, btc: opts.btc, volClamp: DEFAULT_PARAMS.volClamp });
  const r = prepareReturns(ctx.trainReturns, DEFAULT_PARAMS.demeaned);
  const volScale0 = DEFAULT_PARAMS.volScaling ? inputs.volScaleApplied : 1;
  const fanDays = opts.withFan === false ? [] : fanSchedule(H);
  const sim = simulatePaths(r, H, paths, DEFAULT_PARAMS.blockLength, seed, volScale0, DEFAULT_PARAMS.volDecayDays, fanDays);
  const anchor = last.c;
  const quantiles = {} as Quantiles;
  QUANTILE_LEVELS.forEach((q, i) => (quantiles[QUANTILE_KEYS[i]] = anchor * Math.exp(quantileSorted(sim.terminal, q))));

  const fan: FanPoint[] = [{ t: last.t, p05: anchor, p25: anchor, p50: anchor, p75: anchor, p95: anchor }];
  for (const f of sim.fan) {
    const qv = (q: number) => anchor * Math.exp(quantileSorted(f.sorted, q));
    fan.push({ t: last.t + f.day * DAY_MS, p05: qv(0.05), p25: qv(0.25), p50: qv(0.5), p75: qv(0.75), p95: qv(0.95) });
  }

  const status = horizonStatus(opts.historyDaysForGating ?? candles.length, H);
  const uncertainty = {
    bandWidth50Pct: ((quantiles.p75 - quantiles.p25) / quantiles.p50) * 100,
    bandWidth90Pct: ((quantiles.p95 - quantiles.p05) / quantiles.p50) * 100,
    returnSampleSize: ctx.trainReturns.length,
    independentWindows: status.independentWindows,
    paths,
    horizonStatus: status.status,
    lowSample: status.status !== "enabled",
    limitations: modelLimitations(status.status, ctx.trainReturns.length, H),
  };
  const parameters: ModelParameters = {
    blockLength: DEFAULT_PARAMS.blockLength,
    paths,
    trainingWindowDays: DEFAULT_PARAMS.trainingWindowDays,
    volScaling: DEFAULT_PARAMS.volScaling,
    volClamp: DEFAULT_PARAMS.volClamp,
    volDecayDays: DEFAULT_PARAMS.volDecayDays,
    demeaned: DEFAULT_PARAMS.demeaned,
    seed,
  };
  const trainingStart = isoDate(candles[Math.max(0, ctx.trainStartIdx)].t);
  return {
    asset: opts.asset ?? "XRP-USD",
    modelName: MODEL_NAME,
    modelVersion: MODEL_VERSION,
    horizonKey: horizonByDays(H)?.key ?? null,
    horizonDays: H,
    asOf: last.t,
    asOfDate,
    targetDate: isoDate(last.t + H * DAY_MS),
    computedAt: opts.computedAt ?? Date.now(),
    trainingStart,
    trainingEnd: asOfDate,
    dataProvider: opts.dataProvider ?? "unknown",
    quantiles,
    scenarios: buildScenarios({ quantiles, anchor, inputs, horizonDays: H, lowSample: uncertainty.lowSample }),
    inputs,
    uncertainty,
    assumptions: modelAssumptions(H),
    parameters,
    fan,
  };
}

/**
 * Fast path used by walk-forward evaluation: terminal quantile band only (no drivers, no fan).
 * Same method, same seed rule, fewer paths.
 */
export function scenarioBand(candles: Candle[], horizonDays: number, paths = EVAL_PATHS): BandForecast {
  const last = candles[candles.length - 1];
  const ctx = buildContext(candles, DEFAULT_PARAMS.trainingWindowDays);
  const k = ctx.vol30 !== null && ctx.volTrain > 0 ? ctx.vol30 / ctx.volTrain : 1;
  const volScale0 = Math.min(DEFAULT_PARAMS.volClamp[1], Math.max(DEFAULT_PARAMS.volClamp[0], k));
  const r = prepareReturns(ctx.trainReturns, DEFAULT_PARAMS.demeaned);
  const sim = simulatePaths(r, horizonDays, paths, DEFAULT_PARAMS.blockLength, modelSeed(isoDate(last.t), horizonDays), volScale0, DEFAULT_PARAMS.volDecayDays);
  const q = (p: number) => last.c * Math.exp(quantileSorted(sim.terminal, p));
  return { model: MODEL_NAME, p05: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95) };
}
