/**
 * Cross-asset correlation & beta (spec §53).
 * Pearson correlation of DAILY LOG RETURNS aligned by UTC day. A return pair is only formed when both
 * series have closes on the same two consecutive days (no forward-filling, no interpolation).
 * Correlation does not imply causation.
 */
import type { Candle } from "@/lib/types/market";
import { pearson } from "./indicators";
import { DAY_MS } from "./history";

export interface ReturnPair {
  t: number;
  a: number;
  b: number;
}

export function alignedLogReturns(a: Candle[], b: Candle[]): ReturnPair[] {
  const mb = new Map(b.map((k) => [k.t, k.c]));
  const out: ReturnPair[] = [];
  for (let i = 1; i < a.length; i++) {
    const t = a[i].t;
    const tp = a[i - 1].t;
    if (t - tp !== DAY_MS) continue;
    const b1 = mb.get(t);
    const b0 = mb.get(tp);
    if (b1 === undefined || b0 === undefined || b0 <= 0 || b1 <= 0 || a[i - 1].c <= 0 || a[i].c <= 0) continue;
    out.push({ t, a: Math.log(a[i].c / a[i - 1].c), b: Math.log(b1 / b0) });
  }
  return out;
}

export interface WindowCorrelation {
  windowDays: number;
  r: number | null;
  n: number;
  /** Expected pairs in a complete window (for coverage display). */
  expected: number;
  start: number | null;
  end: number | null;
  beta: number | null;
}

/** Beta of a vs b (cov(a,b) / var(b)). */
export function beta(pairs: ReturnPair[]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const ma = pairs.reduce((s, p) => s + p.a, 0) / n;
  const mb = pairs.reduce((s, p) => s + p.b, 0) / n;
  let cov = 0;
  let vb = 0;
  for (const p of pairs) {
    cov += (p.a - ma) * (p.b - mb);
    vb += (p.b - mb) ** 2;
  }
  return vb === 0 ? null : cov / vb;
}

/** Trailing calendar windows ending at the last common return date. */
export function correlationWindows(pairs: ReturnPair[], windows: number[] = [30, 90, 180, 365]): WindowCorrelation[] {
  if (!pairs.length) return windows.map((w) => ({ windowDays: w, r: null, n: 0, expected: w, start: null, end: null, beta: null }));
  const end = pairs[pairs.length - 1].t;
  return windows.map((w) => {
    const from = end - (w - 1) * DAY_MS;
    const sub = pairs.filter((p) => p.t >= from);
    return {
      windowDays: w,
      r: sub.length >= Math.max(10, w * 0.5) ? pearson(sub.map((p) => p.a), sub.map((p) => p.b)) : null,
      n: sub.length,
      expected: w,
      start: sub[0]?.t ?? null,
      end,
      beta: sub.length >= Math.max(10, w * 0.5) ? beta(sub) : null,
    };
  });
}

/** Causal rolling correlation: value at t uses return pairs in (t − window, t]. Requires ≥ 80% coverage. */
export function rollingCorrelation(pairs: ReturnPair[], windowDays = 90): { t: number; r: number | null }[] {
  const out: { t: number; r: number | null }[] = [];
  let lo = 0;
  for (let i = 0; i < pairs.length; i++) {
    const from = pairs[i].t - (windowDays - 1) * DAY_MS;
    while (pairs[lo].t < from) lo++;
    const sub = pairs.slice(lo, i + 1);
    out.push({ t: pairs[i].t, r: sub.length >= windowDays * 0.8 ? pearson(sub.map((p) => p.a), sub.map((p) => p.b)) : null });
  }
  return out;
}

export function describeCorrelation(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "insufficient data";
  const a = Math.abs(r);
  const strength = a >= 0.8 ? "very strong" : a >= 0.6 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "negligible";
  return `${strength} ${r >= 0 ? "positive" : "negative"}`;
}
