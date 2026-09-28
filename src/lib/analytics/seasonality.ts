/**
 * Seasonality (spec §50). Monthly, yearly and weekday return patterns with explicit sample sizes.
 *
 * Methodology:
 * - Monthly return = last close of month ÷ last close of the previous month − 1 (UTC calendar months).
 *   A month is only included when the previous month's close exists and the month is complete
 *   (it is not the current month and has at least MIN_DAYS_IN_MONTH daily closes).
 * - Weekday return = close ÷ previous day's close − 1 for consecutive UTC days only.
 * - Statistics per bucket: N, mean, median, share of positive observations, min, max.
 * - Buckets with N < SEASONALITY_MIN_N are flagged as small samples — no conclusions should be drawn.
 */
import type { Candle } from "@/lib/types/market";
import { DAY_MS, summarize } from "./history";

export const SEASONALITY_MIN_N = 5;
export const MIN_DAYS_IN_MONTH = 25;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface MonthReturn {
  year: number;
  /** 0–11 */
  month: number;
  returnPct: number;
  days: number;
  /** false for the current (partial) month or months with too few closes — excluded from stats. */
  complete: boolean;
}

export function monthlyReturns(candles: Candle[], now: number = Date.now()): MonthReturn[] {
  const buckets = new Map<number, { year: number; month: number; last: number; days: number }>();
  const order: number[] = [];
  for (const k of candles) {
    const d = new Date(k.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    let b = buckets.get(key);
    if (!b) {
      b = { year: d.getUTCFullYear(), month: d.getUTCMonth(), last: k.c, days: 0 };
      buckets.set(key, b);
      order.push(key);
    }
    b.last = k.c;
    b.days++;
  }
  const nowD = new Date(now);
  const currentKey = nowD.getUTCFullYear() * 12 + nowD.getUTCMonth();
  const out: MonthReturn[] = [];
  for (const key of order) {
    const prev = buckets.get(key - 1);
    const b = buckets.get(key)!;
    if (!prev) continue;
    out.push({
      year: b.year,
      month: b.month,
      returnPct: (b.last / prev.last - 1) * 100,
      days: b.days,
      complete: key < currentKey && b.days >= MIN_DAYS_IN_MONTH && prev.days >= 1,
    });
  }
  return out;
}

export interface BucketStats {
  key: number;
  label: string;
  n: number;
  mean: number | null;
  median: number | null;
  positiveRate: number | null;
  min: number | null;
  max: number | null;
  smallSample: boolean;
}

function bucketStats(key: number, label: string, values: number[]): BucketStats {
  const s = summarize(values);
  return {
    key,
    label,
    n: s.n,
    mean: s.mean,
    median: s.median,
    positiveRate: s.n ? (values.filter((v) => v > 0).length / s.n) * 100 : null,
    min: s.min,
    max: s.max,
    smallSample: s.n < SEASONALITY_MIN_N,
  };
}

export function monthStats(months: MonthReturn[]): BucketStats[] {
  return MONTH_NAMES.map((name, m) =>
    bucketStats(
      m,
      name,
      months.filter((r) => r.complete && r.month === m).map((r) => r.returnPct),
    ),
  );
}

export interface YearReturn {
  year: number;
  returnPct: number;
  /** false when the year is the current year or the dataset does not cover it fully. */
  complete: boolean;
  startClose: number;
  endClose: number;
}

/** Calendar-year returns: last close of year ÷ last close of previous year − 1. */
export function yearlyReturns(candles: Candle[], now: number = Date.now()): YearReturn[] {
  const last = new Map<number, number>();
  const days = new Map<number, number>();
  for (const k of candles) {
    const y = new Date(k.t).getUTCFullYear();
    last.set(y, k.c);
    days.set(y, (days.get(y) ?? 0) + 1);
  }
  const curY = new Date(now).getUTCFullYear();
  const out: YearReturn[] = [];
  for (const [y, c] of last) {
    const p = last.get(y - 1);
    if (p === undefined) continue;
    out.push({ year: y, returnPct: (c / p - 1) * 100, complete: y < curY && (days.get(y) ?? 0) >= 350, startClose: p, endClose: c });
  }
  return out.sort((a, b) => a.year - b.year);
}

/** Weekday statistics of consecutive-day simple returns (UTC). Monday = 0. */
export function weekdayStats(candles: Candle[]): BucketStats[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].t - candles[i - 1].t !== DAY_MS) continue;
    const wd = (new Date(candles[i].t).getUTCDay() + 6) % 7;
    buckets[wd].push((candles[i].c / candles[i - 1].c - 1) * 100);
  }
  return WEEKDAY_NAMES.map((name, i) => bucketStats(i, name, buckets[i]));
}

export function seasonalityCoverage(months: MonthReturn[]): { from: { year: number; month: number } | null; to: { year: number; month: number } | null; completeMonths: number } {
  const c = months.filter((m) => m.complete);
  return {
    from: c.length ? { year: c[0].year, month: c[0].month } : null,
    to: c.length ? { year: c[c.length - 1].year, month: c[c.length - 1].month } : null,
    completeMonths: c.length,
  };
}
