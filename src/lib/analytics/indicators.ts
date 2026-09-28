/**
 * Technical indicators. Pure & deterministic. Each output array is aligned with the
 * input (same length); values are `null` until enough history exists (warm-up).
 * Every value at index i uses ONLY inputs[0..i] — no lookahead (spec §117).
 */
import type { Candle } from "@/lib/types/market";

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9): { macd: Series; signal: Series; hist: Series } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));
  const firstIdx = line.findIndex((v) => v !== null);
  const sig: Series = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    const e = ema(compact, signal);
    e.forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist: Series = line.map((v, i) => (v !== null && sig[i] !== null ? v - (sig[i] as number) : null));
  return { macd: line, signal: sig, hist };
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function bollinger(values: number[], period = 20, mult = 2): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const w = values.slice(i - period + 1, i + 1);
    const m = mid[i] as number;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period); // population sd (standard BB)
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function trueRange(c: Candle[]): number[] {
  return c.map((k, i) => (i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c))));
}

/** Wilder's ATR */
export function atr(c: Candle[], period = 14): Series {
  const tr = trueRange(c);
  const out: Series = new Array(c.length).fill(null);
  if (c.length < period) return out;
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period;
  out[period - 1] = a;
  for (let i = period; i < c.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

/** Session VWAP that resets each UTC day (intraday timeframes only). */
export function vwap(c: Candle[]): Series {
  const out: Series = [];
  let pv = 0;
  let vol = 0;
  let day = -1;
  for (const k of c) {
    const d = Math.floor(k.t / 86_400_000);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const typical = (k.h + k.l + k.c) / 3;
    pv += typical * k.v;
    vol += k.v;
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}

/** Daily log returns aligned to candles (index 0 = null). */
export function logReturns(closes: number[]): Series {
  return closes.map((c, i) => (i === 0 || closes[i - 1] <= 0 || c <= 0 ? null : Math.log(c / closes[i - 1])));
}

/** Rolling annualized realized volatility of log returns (365 trading days for crypto). */
export function rollingVolatility(closes: number[], window = 30, annualization = 365): Series {
  const r = logReturns(closes);
  const out: Series = new Array(closes.length).fill(null);
  for (let i = window; i < closes.length; i++) {
    const w = r.slice(i - window + 1, i + 1).filter((x): x is number => x !== null);
    if (w.length >= window * 0.8) out[i] = stdev(w) * Math.sqrt(annualization);
  }
  return out;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  let sa = 0,
    sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

/** Percentile rank (0–100) of `value` within `sample`. */
export function percentileRank(sample: number[], value: number): number | null {
  const s = sample.filter((x) => Number.isFinite(x));
  if (!s.length) return null;
  const below = s.filter((x) => x < value).length;
  const equal = s.filter((x) => x === value).length;
  return ((below + 0.5 * equal) / s.length) * 100;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Align two candle series by timestamp; returns paired closes. */
export function alignByTime(a: Candle[], b: Candle[]): { t: number; a: number; b: number }[] {
  const mb = new Map(b.map((k) => [k.t, k.c]));
  const out: { t: number; a: number; b: number }[] = [];
  for (const k of a) {
    const v = mb.get(k.t);
    if (v !== undefined) out.push({ t: k.t, a: k.c, b: v });
  }
  return out;
}
