/**
 * Historical analogues (spec §49). Finds past dates whose measurable conditions resemble the latest date.
 * "Historical similarity does not imply future repetition."
 *
 * Methodology:
 * - Feature vector per date i (each uses ONLY closes[0..i] — no lookahead):
 *     ret30   = ln(c[i] / c[i−30])
 *     ret90   = ln(c[i] / c[i−90])
 *     vol30   = annualized stdev of daily log returns over the trailing 30 days
 *     dist200 = ln(c[i] / SMA200[i])
 *     ddAth   = ln(c[i] / max(c[0..i]))
 * - Each feature is z-scored across all eligible dates (candidates + the reference date).
 * - Distance = RMS of z-score differences (Euclidean ÷ √k). Similarity = 100 ÷ (1 + distance).
 * - Candidates must be ≥ `minGapDays` before the reference date, so the recent regime cannot match itself
 *   and every candidate has fully realized forward returns.
 * - Top matches are chosen greedily by distance, skipping any date within `separationDays` of an already
 *   chosen analogue (non-overlapping episodes).
 * - "What happened next" = close-to-close return 30 / 90 days after the analogue date, and the maximum
 *   drawdown within those 90 days. Those outcomes are historical facts about the analogue — not a forecast.
 */
import type { Candle } from "@/lib/types/market";
import { sma } from "./indicators";
import { DAY_MS, summarize, type Summary } from "./history";

export const ANALOGUE_FEATURES = ["ret30", "ret90", "vol30", "dist200", "ddAth"] as const;
export type AnalogueFeature = (typeof ANALOGUE_FEATURES)[number];
export const FEATURE_LABELS: Record<AnalogueFeature, string> = {
  ret30: "30D return",
  ret90: "90D return",
  vol30: "30D volatility",
  dist200: "Distance from 200D SMA",
  ddAth: "Drawdown from ATH",
};

export type FeatureVector = Record<AnalogueFeature, number>;

/** Causal feature vectors for every index with enough history (≥ 200 days). null otherwise. */
export function analogueFeatures(candles: Candle[]): (FeatureVector | null)[] {
  const closes = candles.map((k) => k.c);
  const s200 = sma(closes, 200);
  const out: (FeatureVector | null)[] = new Array(candles.length).fill(null);
  let runMax = -Infinity;
  // incremental 30D sum / sum of squares of log returns
  const lr = closes.map((c, i) => (i === 0 ? 0 : Math.log(c / closes[i - 1])));
  for (let i = 0; i < candles.length; i++) {
    if (closes[i] > runMax) runMax = closes[i];
    if (i < 199 || s200[i] === null) continue;
    const w = lr.slice(i - 29, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1));
    out[i] = {
      ret30: Math.log(closes[i] / closes[i - 30]),
      ret90: Math.log(closes[i] / closes[i - 90]),
      vol30: sd * Math.sqrt(365),
      dist200: Math.log(closes[i] / (s200[i] as number)),
      ddAth: Math.log(closes[i] / runMax),
    };
  }
  return out;
}

export interface Analogue {
  t: number;
  index: number;
  distance: number;
  similarity: number;
  features: FeatureVector;
  /** Per-feature z-score difference (candidate − reference). */
  zDiff: FeatureVector;
  fwd30Pct: number | null;
  fwd90Pct: number | null;
  maxDd90Pct: number | null;
  close: number;
}

export interface AnalogueResult {
  reference: { t: number; features: FeatureVector } | null;
  analogues: Analogue[];
  candidates: number;
  fwd30: Summary;
  fwd90: Summary;
  params: { minGapDays: number; separationDays: number; top: number };
}

export function findAnalogues(
  candles: Candle[],
  opts: { minGapDays?: number; separationDays?: number; top?: number; referenceIndex?: number } = {},
): AnalogueResult {
  const minGapDays = opts.minGapDays ?? 180;
  const separationDays = opts.separationDays ?? 90;
  const top = opts.top ?? 5;
  const params = { minGapDays, separationDays, top };
  const empty: AnalogueResult = { reference: null, analogues: [], candidates: 0, fwd30: summarize([]), fwd90: summarize([]), params };
  const refIdx = opts.referenceIndex ?? candles.length - 1;
  if (refIdx < 0 || refIdx >= candles.length) return empty;
  // Only data up to the reference date is visible.
  const visible = candles.slice(0, refIdx + 1);
  const feats = analogueFeatures(visible);
  const ref = feats[refIdx];
  if (!ref) return empty;
  const refT = visible[refIdx].t;
  const cutoff = refT - minGapDays * DAY_MS;

  const cand: number[] = [];
  for (let i = 0; i < visible.length; i++) if (feats[i] && visible[i].t <= cutoff) cand.push(i);
  if (!cand.length) return { ...empty, reference: { t: refT, features: ref } };

  // z-score stats over candidates + reference
  const pool = [...cand.map((i) => feats[i] as FeatureVector), ref];
  const mu = {} as FeatureVector;
  const sd = {} as FeatureVector;
  for (const f of ANALOGUE_FEATURES) {
    const v = pool.map((x) => x[f]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
    mu[f] = m;
    sd[f] = s > 0 ? s : 1;
  }
  const z = (x: FeatureVector, f: AnalogueFeature) => (x[f] - mu[f]) / sd[f];

  const scored = cand.map((i) => {
    const fv = feats[i] as FeatureVector;
    const zDiff = {} as FeatureVector;
    let ss = 0;
    for (const f of ANALOGUE_FEATURES) {
      const d = z(fv, f) - z(ref, f);
      zDiff[f] = d;
      ss += d * d;
    }
    const distance = Math.sqrt(ss / ANALOGUE_FEATURES.length);
    return { i, distance, zDiff };
  });
  scored.sort((a, b) => a.distance - b.distance);

  const chosen: typeof scored = [];
  for (const s of scored) {
    if (chosen.length >= top) break;
    if (chosen.some((c) => Math.abs(visible[c.i].t - visible[s.i].t) < separationDays * DAY_MS)) continue;
    chosen.push(s);
  }

  // forward outcomes — computed from `visible` only (all ≤ reference date)
  const fwd = (i: number, days: number) => {
    const target = visible[i].t + days * DAY_MS;
    for (let j = i + 1; j < visible.length; j++) if (visible[j].t >= target) return j;
    return -1;
  };
  const analogues: Analogue[] = chosen.map(({ i, distance, zDiff }) => {
    const j30 = fwd(i, 30);
    const j90 = fwd(i, 90);
    let maxDd: number | null = null;
    if (j90 > 0) {
      let peak = visible[i].c;
      let worst = 0;
      for (let j = i; j <= j90; j++) {
        if (visible[j].c > peak) peak = visible[j].c;
        worst = Math.min(worst, visible[j].c / peak - 1);
      }
      maxDd = worst * 100;
    }
    return {
      t: visible[i].t,
      index: i,
      distance,
      similarity: 100 / (1 + distance),
      features: feats[i] as FeatureVector,
      zDiff,
      fwd30Pct: j30 > 0 ? (visible[j30].c / visible[i].c - 1) * 100 : null,
      fwd90Pct: j90 > 0 ? (visible[j90].c / visible[i].c - 1) * 100 : null,
      maxDd90Pct: maxDd,
      close: visible[i].c,
    };
  });

  return {
    reference: { t: refT, features: ref },
    analogues,
    candidates: cand.length,
    fwd30: summarize(analogues.map((a) => a.fwd30Pct).filter((x): x is number => x !== null)),
    fwd90: summarize(analogues.map((a) => a.fwd90Pct).filter((x): x is number => x !== null)),
    params,
  };
}
