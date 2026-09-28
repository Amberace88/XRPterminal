/**
 * Measurable inputs ("drivers") for Future Intelligence (spec §58).
 * Every function here receives ONLY candles up to the as-of date (the caller slices);
 * nothing reads beyond the last element — no lookahead (spec §65).
 */
import type { Candle } from "@/lib/types/market";
import { computeRegime } from "@/lib/analytics/regime";
import type { AnalogueStats, ForecastInputs } from "./types";
import { clamp, isoDate, logReturnsOf, pearsonOf, quantileSorted, rollingMean, rollingStd, stdOf } from "./stats";

export const ANNUALIZATION = Math.sqrt(365);

function rankPct(sortedAsc: Float64Array, v: number): number {
  // fraction of values < v plus half of ties, in %
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  let eq = lo;
  while (eq < sortedAsc.length && sortedAsc[eq] === v) eq++;
  return ((lo + 0.5 * (eq - lo)) / sortedAsc.length) * 100;
}

export interface FeatureContext {
  closes: Float64Array;
  returns: Float64Array; // length n-1, returns[i-1] = log(c[i]/c[i-1])
  /** Returns used for the bootstrap (trailing training window), NOT demeaned. */
  trainReturns: Float64Array;
  trainStartIdx: number; // candle index where the training window starts
  vol30: number | null; // daily
  volTrain: number; // daily
  volPercentile: number | null;
  volP10: number | null; // daily
  volP90: number | null; // daily
  sma200Above: boolean | null;
}

export function buildContext(candles: Candle[], trainingWindowDays: number): FeatureContext {
  const n = candles.length;
  const closes = new Float64Array(n);
  for (let i = 0; i < n; i++) closes[i] = candles[i].c;
  const returns = logReturnsOf(closes);
  const m = Math.min(returns.length, trainingWindowDays);
  const trainReturns = returns.subarray(returns.length - m);
  const trainStartIdx = n - 1 - m; // the close before the first training return
  const rs = rollingStd(returns, 30);
  const vol30 = returns.length >= 30 ? rs[rs.length - 1] : null;
  const volTrain = stdOf(trainReturns);
  let volPercentile: number | null = null;
  let volP10: number | null = null;
  let volP90: number | null = null;
  // percentile vs rolling 30D vol observed inside the training window (≤ as-of)
  const hist = Float64Array.from(rs.subarray(Math.max(29, rs.length - m)).filter((x) => Number.isFinite(x))).sort();
  if (hist.length > 20) {
    if (vol30 !== null) volPercentile = rankPct(hist, vol30);
    volP10 = quantileSorted(hist, 0.1);
    volP90 = quantileSorted(hist, 0.9);
  }
  const sma200 = n >= 200 ? rollingMean(closes, 200)[n - 1] : NaN;
  return {
    closes,
    returns,
    trainReturns,
    trainStartIdx,
    vol30,
    volTrain,
    volPercentile,
    volP10,
    volP90,
    sma200Above: Number.isFinite(sma200) ? closes[n - 1] > sma200 : null,
  };
}

/**
 * Historical analogue: past dates (≤ as-of − H so the forward outcome is known AT the as-of date)
 * with the same 200D-trend state and the same volatility tercile as today.
 * Returns the sorted forward returns (in %, simple) for reuse by the analogue baseline.
 */
export function analogueForwardReturns(
  ctx: FeatureContext,
  horizonDays: number,
): { fwd: Float64Array; independentN: number; criteria: string } | null {
  const { closes, returns } = ctx;
  const n = closes.length;
  if (n < 260 || ctx.vol30 === null || ctx.sma200Above === null) return null;
  const vol = rollingStd(returns, 30); // vol[k] ↔ candle k+1
  const sma200 = rollingMean(closes, 200);
  const volVals = Float64Array.from(vol.filter((x) => Number.isFinite(x))).sort();
  const tercile = (v: number) => {
    const p = rankPct(volVals, v);
    return p < 100 / 3 ? 0 : p < 200 / 3 ? 1 : 2;
  };
  const nowT = tercile(ctx.vol30);
  const nowAbove = ctx.sma200Above;
  const fwd: number[] = [];
  let independent = 0;
  let nextFree = -1;
  for (let j = 199; j + horizonDays <= n - 1; j++) {
    const v = vol[j - 1];
    if (!Number.isFinite(v) || !Number.isFinite(sma200[j])) continue;
    if (closes[j] > sma200[j] !== nowAbove) continue;
    if (tercile(v) !== nowT) continue;
    fwd.push((closes[j + horizonDays] / closes[j] - 1) * 100);
    if (j >= nextFree) {
      independent++;
      nextFree = j + horizonDays;
    }
  }
  const terc = ["low", "mid", "high"][nowT];
  const criteria = `Past dates with price ${nowAbove ? "above" : "below"} its 200D average and 30D volatility in the ${terc} tercile, outcome ${horizonDays} days later (only outcomes known by the as-of date).`;
  return { fwd: Float64Array.from(fwd).sort(), independentN: independent, criteria };
}

export function historicalAnalogue(ctx: FeatureContext, horizonDays: number): AnalogueStats | null {
  const a = analogueForwardReturns(ctx, horizonDays);
  if (!a) return null;
  const { fwd, independentN, criteria } = a;
  if (fwd.length < 10) return { criteria, n: fwd.length, independentN, medianReturnPct: null, p25ReturnPct: null, p75ReturnPct: null, shareUpPct: null };
  let up = 0;
  for (let i = 0; i < fwd.length; i++) if (fwd[i] > 0) up++;
  return {
    criteria,
    n: fwd.length,
    independentN,
    medianReturnPct: quantileSorted(fwd, 0.5),
    p25ReturnPct: quantileSorted(fwd, 0.25),
    p75ReturnPct: quantileSorted(fwd, 0.75),
    shareUpPct: (up / fwd.length) * 100,
  };
}

/** 90D correlation of daily log returns with BTC, using only dates ≤ as-of present in both series. */
export function btcCorrelation(xrp: Candle[], btc: Candle[] | null | undefined, window = 90): { value: number | null; note: string } {
  if (!btc || btc.length < window + 1) return { value: null, note: "BTC reference series not available." };
  const asOf = xrp[xrp.length - 1].t;
  const bm = new Map<number, number>();
  for (const k of btc) if (k.t <= asOf) bm.set(k.t, k.c);
  const pairs: { a: number; b: number }[] = [];
  for (let i = xrp.length - 1; i >= 0 && pairs.length < window + 1; i--) {
    const b = bm.get(xrp[i].t);
    if (b !== undefined) pairs.unshift({ a: xrp[i].c, b });
  }
  if (pairs.length < window + 1) return { value: null, note: "Insufficient overlapping BTC history." };
  const ra = logReturnsOf(pairs.map((p) => p.a));
  const rb = logReturnsOf(pairs.map((p) => p.b));
  return { value: pearsonOf(ra, rb), note: `Pearson correlation of ${window} daily log returns, XRP vs BTC.` };
}

export function computeInputs(
  candles: Candle[],
  ctx: FeatureContext,
  opts: { horizonDays: number; btc?: Candle[] | null; volClamp: [number, number] },
): ForecastInputs {
  const n = candles.length;
  const last = candles[n - 1];
  const regime = n >= 220 ? computeRegime(candles) : null;
  const volRatioRaw = ctx.vol30 !== null && ctx.volTrain > 0 ? ctx.vol30 / ctx.volTrain : null;
  const corr = btcCorrelation(candles, opts.btc);
  return {
    anchorPrice: last.c,
    anchorDate: isoDate(last.t),
    vol30Ann: ctx.vol30 !== null ? ctx.vol30 * ANNUALIZATION : null,
    volTrainAnn: ctx.volTrain * ANNUALIZATION,
    volRatioRaw,
    volScaleApplied: volRatioRaw !== null ? clamp(volRatioRaw, opts.volClamp[0], opts.volClamp[1]) : 1,
    volPercentile: ctx.volPercentile,
    volP10Ann: ctx.volP10 !== null ? ctx.volP10 * ANNUALIZATION : null,
    volP90Ann: ctx.volP90 !== null ? ctx.volP90 * ANNUALIZATION : null,
    regime: regime?.regime ?? "UNKNOWN",
    regimeExplanation: regime?.explanation ?? "Insufficient history to classify the regime.",
    distFrom200Pct: regime?.metrics.distFrom200Pct ?? null,
    ret30Pct: n > 30 ? (last.c / candles[n - 31].c - 1) * 100 : null,
    ret90Pct: n > 90 ? (last.c / candles[n - 91].c - 1) * 100 : null,
    btcCorr90: corr.value,
    btcCorrNote: corr.note,
    analogue: historicalAnalogue(ctx, opts.horizonDays),
  };
}
