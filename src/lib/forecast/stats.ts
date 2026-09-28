/**
 * Small deterministic numeric helpers for the forecast engine.
 * Typed-array friendly and allocation-light (history ≈ 3.5k candles, 4k paths).
 */
import type { Candle } from "@/lib/types/market";

export const DAY_MS = 86_400_000;

/** cyrb53 string hash → 53-bit integer. Stable across platforms. */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear-interpolated quantile of an ascending-sorted array-like. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function meanOf(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : NaN;
}

export function stdOf(a: ArrayLike<number>): number {
  const n = a.length;
  if (n < 2) return NaN;
  const m = meanOf(a);
  let v = 0;
  for (let i = 0; i < n; i++) v += (a[i] - m) ** 2;
  return Math.sqrt(v / (n - 1));
}

/** Daily log returns of closes (length n-1). Non-positive prices yield 0 (validated upstream). */
export function logReturnsOf(closes: ArrayLike<number>): Float64Array {
  const n = closes.length;
  const out = new Float64Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    out[i - 1] = a > 0 && b > 0 ? Math.log(b / a) : 0;
  }
  return out;
}

/**
 * Causal rolling sample std of a series over `window` values: out[i] uses x[i-window+1..i].
 * NaN until warm-up. O(n) with running sums.
 */
export function rollingStd(x: ArrayLike<number>, window: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s += x[i];
    s2 += x[i] * x[i];
    if (i >= window) {
      s -= x[i - window];
      s2 -= x[i - window] * x[i - window];
    }
    if (i >= window - 1) {
      const m = s / window;
      const v = Math.max(0, (s2 - window * m * m) / (window - 1));
      out[i] = Math.sqrt(v);
    }
  }
  return out;
}

/** Causal simple moving average (NaN until warm-up). */
export function rollingMean(x: ArrayLike<number>, window: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += x[i];
    if (i >= window) s -= x[i - window];
    if (i >= window - 1) out[i] = s / window;
  }
  return out;
}

export function pearsonOf(a: ArrayLike<number>, b: ArrayLike<number>): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

export function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Keep only COMPLETED daily candles: a UTC daily candle opened at t is complete once now ≥ t + 1 day.
 * Using an in-progress candle would make "as-of" non-deterministic.
 */
export function completedDaily(candles: Candle[], now: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].t + DAY_MS > now) end--;
  return end === candles.length ? candles : candles.slice(0, end);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Round to a number of significant digits (used for canonical hashing of floats). */
export function roundSig(v: number, digits = 10): number {
  if (!Number.isFinite(v) || v === 0) return v;
  return Number(v.toPrecision(digits));
}
