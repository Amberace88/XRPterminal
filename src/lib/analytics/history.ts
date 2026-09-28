/**
 * Historical intelligence — ATH, drawdown, recovery and volatility-history analytics (spec §46–48, §51).
 * Pure & deterministic. Inputs are validated daily candles (UTC, ascending) from a single provider.
 * Everything here DESCRIBES the past; nothing implies that history will repeat.
 */
import type { Candle } from "@/lib/types/market";
import { percentileRank, quantile, rollingVolatility } from "./indicators";

export const DAY_MS = 86_400_000;

export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY_MS);

/* ------------------------------------------------------------------ */
/* Generic summary statistics                                          */
/* ------------------------------------------------------------------ */

export interface Summary {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
}

export function summarize(values: number[]): Summary {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (!n) return { n: 0, mean: null, median: null, min: null, max: null, stdev: null };
  const s = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean, median: quantile(s, 0.5), min: s[0], max: s[n - 1], stdev: sd };
}

/* ------------------------------------------------------------------ */
/* Drawdown / underwater series                                        */
/* ------------------------------------------------------------------ */

/** Causal underwater series: % below the running all-time closing high (0 at new highs, negative otherwise). */
export function drawdownSeries(candles: Candle[]): { t: number; dd: number; peak: number }[] {
  let peak = -Infinity;
  return candles.map((k) => {
    if (k.c > peak) peak = k.c;
    return { t: k.t, dd: (k.c / peak - 1) * 100, peak };
  });
}

/* ------------------------------------------------------------------ */
/* ATH analysis                                                        */
/* ------------------------------------------------------------------ */

export interface UnderwaterEpisode {
  /** Running ATH (close) at the start of the episode. */
  peakT: number;
  peak: number;
  troughT: number;
  trough: number;
  /** Deepest decline in %, negative. */
  depthPct: number;
  /** First close at or above the prior ATH (null if never reclaimed). */
  reclaimT: number | null;
  /** Peak → reclaim, days. */
  daysToReclaim: number | null;
}

/** Periods spent below the running all-time closing high whose depth reached `minDepthPct`. */
export function underwaterEpisodes(candles: Candle[], minDepthPct = 20): UnderwaterEpisode[] {
  const out: UnderwaterEpisode[] = [];
  if (candles.length < 2) return out;
  let peakIdx = 0;
  let troughIdx = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i].c;
    const peak = candles[peakIdx].c;
    if (c >= peak) {
      // episode closes (if any drawdown happened)
      const depth = (candles[troughIdx].c / peak - 1) * 100;
      if (troughIdx > peakIdx && depth <= -minDepthPct) {
        out.push({
          peakT: candles[peakIdx].t,
          peak,
          troughT: candles[troughIdx].t,
          trough: candles[troughIdx].c,
          depthPct: depth,
          reclaimT: candles[i].t,
          daysToReclaim: daysBetween(candles[peakIdx].t, candles[i].t),
        });
      }
      peakIdx = i;
      troughIdx = i;
    } else if (c < candles[troughIdx].c) {
      // troughIdx === peakIdx right after a new high, so the first lower close always starts the trough
      troughIdx = i;
    }
  }
  // still underwater at the end
  const peak = candles[peakIdx].c;
  if (troughIdx > peakIdx) {
    const depth = (candles[troughIdx].c / peak - 1) * 100;
    if (depth <= -minDepthPct)
      out.push({ peakT: candles[peakIdx].t, peak, troughT: candles[troughIdx].t, trough: candles[troughIdx].c, depthPct: depth, reclaimT: null, daysToReclaim: null });
  }
  return out;
}

export interface AthAnalysis {
  datasetStart: number;
  datasetEnd: number;
  n: number;
  athClose: number;
  athCloseT: number;
  athHigh: number;
  athHighT: number;
  lastClose: number;
  lastT: number;
  daysSinceAth: number;
  /** Current close vs closing ATH, % (≤ 0). */
  drawdownFromAthPct: number;
  /** Gain required from the current close to reach the closing ATH, % (≥ 0). */
  distanceToAthPct: number;
  /** Number of days that set a new closing ATH within the dataset. */
  newHighDays: number;
  /** Most recent completed reclaim of a prior ATH after a ≥20% drawdown. */
  lastReclaim: UnderwaterEpisode | null;
  /** Longest completed or ongoing stretch below a prior ATH (days). */
  longestUnderwater: { peakT: number; endT: number; days: number; ongoing: boolean } | null;
}

export function athAnalysis(candles: Candle[]): AthAnalysis | null {
  if (candles.length < 2) return null;
  let athClose = -Infinity;
  let athCloseT = 0;
  let athHigh = -Infinity;
  let athHighT = 0;
  let newHighDays = 0;
  for (const k of candles) {
    if (k.c > athClose) {
      athClose = k.c;
      athCloseT = k.t;
      newHighDays++;
    }
    if (k.h > athHigh) {
      athHigh = k.h;
      athHighT = k.t;
    }
  }
  const last = candles[candles.length - 1];
  const episodes = underwaterEpisodes(candles, 20);
  const reclaimed = episodes.filter((e) => e.reclaimT !== null);
  let longest: AthAnalysis["longestUnderwater"] = null;
  for (const e of underwaterEpisodes(candles, 0)) {
    const endT = e.reclaimT ?? last.t;
    const days = daysBetween(e.peakT, endT);
    if (!longest || days > longest.days) longest = { peakT: e.peakT, endT, days, ongoing: e.reclaimT === null };
  }
  return {
    datasetStart: candles[0].t,
    datasetEnd: last.t,
    n: candles.length,
    athClose,
    athCloseT,
    athHigh,
    athHighT,
    lastClose: last.c,
    lastT: last.t,
    daysSinceAth: daysBetween(athCloseT, last.t),
    drawdownFromAthPct: (last.c / athClose - 1) * 100,
    distanceToAthPct: (athClose / last.c - 1) * 100,
    newHighDays,
    lastReclaim: reclaimed.length ? reclaimed[reclaimed.length - 1] : null,
    longestUnderwater: longest,
  };
}

/* ------------------------------------------------------------------ */
/* Swing declines (zig-zag) — drawdown episodes & recoveries           */
/* ------------------------------------------------------------------ */

export interface DeclineEpisode {
  peakT: number;
  peak: number;
  troughT: number;
  trough: number;
  /** Peak → trough decline, % (negative). */
  depthPct: number;
  declineDays: number;
  /** First close ≥ the swing peak after the trough. */
  recoveredT: number | null;
  /** Trough → recovery, days. */
  recoveryDays: number | null;
  /** Peak → recovery, days (time underwater for this episode). */
  underwaterDays: number | null;
  /** Gain needed from trough to regain the peak, %. */
  recoveryGainPct: number;
  /** ongoing: trough not yet confirmed by a reversal; unrecovered: trough confirmed but peak not regained. */
  status: "recovered" | "unrecovered" | "ongoing";
}

/**
 * Swing declines identified with a symmetric zig-zag on daily closes:
 * a swing high is confirmed once price falls ≥ threshold from it; a swing low once price rises ≥ threshold.
 * Each swing high → following swing low with depth ≥ threshold is one episode.
 */
export function swingDeclines(candles: Candle[], thresholdPct = 20): DeclineEpisode[] {
  const n = candles.length;
  if (n < 3) return [];
  const th = thresholdPct / 100;
  // zig-zag state
  let dir: 0 | 1 | -1 = 0;
  let hiIdx = 0;
  let loIdx = 0;
  const legs: { peak: number; trough: number; confirmed: boolean }[] = [];
  let pendingPeak = -1;
  for (let i = 1; i < n; i++) {
    const c = candles[i].c;
    if (dir === 0) {
      if (c > candles[hiIdx].c) hiIdx = i;
      if (c < candles[loIdx].c) loIdx = i;
      if (c <= candles[hiIdx].c * (1 - th) && hiIdx < i) {
        dir = -1;
        pendingPeak = hiIdx;
        loIdx = i;
      } else if (c >= candles[loIdx].c * (1 + th) && loIdx < i) {
        dir = 1;
        hiIdx = i;
      }
    } else if (dir === 1) {
      if (c > candles[hiIdx].c) hiIdx = i;
      else if (c <= candles[hiIdx].c * (1 - th)) {
        dir = -1;
        pendingPeak = hiIdx;
        loIdx = i;
      }
    } else {
      if (c < candles[loIdx].c) loIdx = i;
      else if (c >= candles[loIdx].c * (1 + th)) {
        legs.push({ peak: pendingPeak, trough: loIdx, confirmed: true });
        pendingPeak = -1;
        dir = 1;
        hiIdx = i;
      }
    }
  }
  if (dir === -1 && pendingPeak >= 0) legs.push({ peak: pendingPeak, trough: loIdx, confirmed: false });

  return legs.map(({ peak, trough, confirmed }) => {
    const p = candles[peak];
    const tr = candles[trough];
    let rec = -1;
    for (let j = trough + 1; j < n; j++)
      if (candles[j].c >= p.c) {
        rec = j;
        break;
      }
    return {
      peakT: p.t,
      peak: p.c,
      troughT: tr.t,
      trough: tr.c,
      depthPct: (tr.c / p.c - 1) * 100,
      declineDays: daysBetween(p.t, tr.t),
      recoveredT: rec >= 0 ? candles[rec].t : null,
      recoveryDays: rec >= 0 ? daysBetween(tr.t, candles[rec].t) : null,
      underwaterDays: rec >= 0 ? daysBetween(p.t, candles[rec].t) : null,
      recoveryGainPct: (p.c / tr.c - 1) * 100,
      status: rec >= 0 ? "recovered" : confirmed ? "unrecovered" : "ongoing",
    } satisfies DeclineEpisode;
  });
}

export interface DrawdownStats {
  episodes: number;
  depth: Summary;
  recoveryDays: Summary;
  declineDays: Summary;
  recoveredCount: number;
  unrecoveredCount: number;
  /** Episodes per year of data. */
  perYear: number | null;
  years: number;
  /** Share of days below the running ATH (any depth), and ≥20% / ≥50% below. */
  underwaterSharePct: number;
  below20SharePct: number;
  below50SharePct: number;
  currentDrawdownPct: number;
  maxDrawdownFromAth: { pct: number; peakT: number; troughT: number } | null;
}

export function drawdownStats(candles: Candle[], episodes: DeclineEpisode[]): DrawdownStats {
  const dd = drawdownSeries(candles);
  const n = dd.length;
  const years = n > 1 ? (candles[n - 1].t - candles[0].t) / (365.25 * DAY_MS) : 0;
  const recovered = episodes.filter((e) => e.status === "recovered");
  let maxDd: DrawdownStats["maxDrawdownFromAth"] = null;
  let peakT = candles[0]?.t ?? 0;
  for (let i = 0; i < n; i++) {
    if (dd[i].dd === 0) peakT = dd[i].t;
    if (!maxDd || dd[i].dd < maxDd.pct) maxDd = { pct: dd[i].dd, peakT, troughT: dd[i].t };
  }
  return {
    episodes: episodes.length,
    depth: summarize(episodes.map((e) => e.depthPct)),
    recoveryDays: summarize(recovered.map((e) => e.recoveryDays as number)),
    declineDays: summarize(episodes.map((e) => e.declineDays)),
    recoveredCount: recovered.length,
    unrecoveredCount: episodes.length - recovered.length,
    perYear: years > 0.5 ? episodes.length / years : null,
    years,
    underwaterSharePct: n ? (dd.filter((d) => d.dd < 0).length / n) * 100 : 0,
    below20SharePct: n ? (dd.filter((d) => d.dd <= -20).length / n) * 100 : 0,
    below50SharePct: n ? (dd.filter((d) => d.dd <= -50).length / n) * 100 : 0,
    currentDrawdownPct: n ? dd[n - 1].dd : 0,
    maxDrawdownFromAth: maxDd,
  };
}

export interface RecoveryStats {
  /** Trough → regain of the swing peak, days (recovered episodes only). */
  days: Summary;
  /** Gain needed from trough to swing peak, % (recovered episodes only). */
  gainPct: Summary;
  /** Peak → regain, days. */
  underwaterDays: Summary;
  censored: number;
}

export function recoveryStats(episodes: DeclineEpisode[]): RecoveryStats {
  const rec = episodes.filter((e) => e.status === "recovered");
  return {
    days: summarize(rec.map((e) => e.recoveryDays as number)),
    gainPct: summarize(rec.map((e) => e.recoveryGainPct)),
    underwaterDays: summarize(rec.map((e) => e.underwaterDays as number)),
    censored: episodes.length - rec.length,
  };
}

/* ------------------------------------------------------------------ */
/* Volatility history                                                   */
/* ------------------------------------------------------------------ */

export type VolBand = "LOW" | "NORMAL" | "ELEVATED" | "EXTREME";

/** Percentile → volatility band. <25 LOW · 25–75 NORMAL · 75–90 ELEVATED · ≥90 EXTREME. */
export function volBand(percentile: number | null): VolBand | null {
  if (percentile === null || !Number.isFinite(percentile)) return null;
  if (percentile < 25) return "LOW";
  if (percentile < 75) return "NORMAL";
  if (percentile < 90) return "ELEVATED";
  return "EXTREME";
}

export interface VolatilityHistory {
  series: { t: number; vol30: number | null; vol90: number | null }[];
  current30: number | null;
  current90: number | null;
  pct30: number | null;
  pct90: number | null;
  band30: VolBand | null;
  /** Quantiles of the 30D series (annualized, fraction). */
  q25: number | null;
  q50: number | null;
  q75: number | null;
  q90: number | null;
  max30: { t: number; v: number } | null;
  min30: { t: number; v: number } | null;
  /** 30D vol 30 days ago — for a trend arrow. */
  prev30: number | null;
  samples30: number;
}

export function volatilityHistory(candles: Candle[]): VolatilityHistory {
  const closes = candles.map((k) => k.c);
  const v30 = rollingVolatility(closes, 30);
  const v90 = rollingVolatility(closes, 90);
  const series = candles.map((k, i) => ({ t: k.t, vol30: v30[i], vol90: v90[i] }));
  const h30 = v30.filter((x): x is number => x !== null);
  const h90 = v90.filter((x): x is number => x !== null);
  const n = candles.length;
  const current30 = n ? v30[n - 1] : null;
  const current90 = n ? v90[n - 1] : null;
  const sorted = [...h30].sort((a, b) => a - b);
  let max30: VolatilityHistory["max30"] = null;
  let min30: VolatilityHistory["min30"] = null;
  series.forEach((s) => {
    if (s.vol30 === null) return;
    if (!max30 || s.vol30 > max30.v) max30 = { t: s.t, v: s.vol30 };
    if (!min30 || s.vol30 < min30.v) min30 = { t: s.t, v: s.vol30 };
  });
  const pct30 = current30 !== null ? percentileRank(h30, current30) : null;
  return {
    series,
    current30,
    current90,
    pct30,
    pct90: current90 !== null ? percentileRank(h90, current90) : null,
    band30: volBand(pct30),
    q25: sorted.length ? quantile(sorted, 0.25) : null,
    q50: sorted.length ? quantile(sorted, 0.5) : null,
    q75: sorted.length ? quantile(sorted, 0.75) : null,
    q90: sorted.length ? quantile(sorted, 0.9) : null,
    max30,
    min30,
    prev30: n > 30 ? v30[n - 31] : null,
    samples30: h30.length,
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** Direction of change with a dead-band (relative). */
export function trendOf(now: number | null | undefined, before: number | null | undefined, deadBand = 0.03): "up" | "down" | "flat" | null {
  if (now === null || now === undefined || before === null || before === undefined || !Number.isFinite(now) || !Number.isFinite(before)) return null;
  const base = Math.abs(before) || 1e-12;
  const ch = (now - before) / base;
  if (Math.abs(ch) < deadBand) return "flat";
  return ch > 0 ? "up" : "down";
}

/** Index of the first candle at or after `t` (binary search). */
export function indexAtOrAfter(candles: Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
