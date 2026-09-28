import type { Candle, Timeframe } from "@/lib/types/market";
import { TIMEFRAME_MS } from "./types";

/**
 * Market data quality validation (spec §157). Returns cleaned candles + flags.
 * Bad rows are removed (and flagged), never silently "fixed" with invented values.
 */
export function validateCandles(candles: Candle[], timeframe: Timeframe): { candles: Candle[]; flags: string[] } {
  const flags: string[] = [];
  const seen = new Set<number>();
  let dup = 0;
  let invalid = 0;
  const clean: Candle[] = [];
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  for (const c of sorted) {
    if (seen.has(c.t)) {
      dup++;
      continue;
    }
    const nums = [c.o, c.h, c.l, c.c];
    if (!Number.isFinite(c.t) || c.t <= 0 || nums.some((n) => !Number.isFinite(n) || n <= 0) || c.v < 0 || c.h < c.l) {
      invalid++;
      continue;
    }
    seen.add(c.t);
    clean.push(c);
  }
  if (dup) flags.push(`${dup} duplicate candle(s) removed`);
  if (invalid) flags.push(`${invalid} invalid candle(s) removed (non-positive, NaN or high<low)`);

  // gaps (only meaningful for fixed intervals up to 1D)
  const step = TIMEFRAME_MS[timeframe];
  if (timeframe !== "1W" && timeframe !== "1M" && clean.length > 2) {
    let gaps = 0;
    for (let i = 1; i < clean.length; i++) if (clean[i].t - clean[i - 1].t > step * 1.5) gaps++;
    if (gaps) flags.push(`${gaps} gap(s) in series (missing candles not interpolated)`);
  }
  // spike detection: >60% move that reverses >50% next candle
  let spikes = 0;
  for (let i = 1; i < clean.length - 1; i++) {
    const up = clean[i].c / clean[i - 1].c - 1;
    const back = clean[i + 1].c / clean[i].c - 1;
    if (Math.abs(up) > 0.6 && Math.sign(up) !== Math.sign(back) && Math.abs(back) > 0.35) spikes++;
  }
  if (spikes) flags.push(`${spikes} suspicious spike(s) detected`);
  return { candles: clean, flags };
}

/** Aggregate candles into a larger bucket (e.g. 1h -> 4h, 1D -> 1W / 1M). Buckets are UTC-aligned. */
export function aggregateCandles(candles: Candle[], target: Timeframe): Candle[] {
  const out: Candle[] = [];
  const bucketOf = (t: number): number => {
    const d = new Date(t);
    if (target === "1M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (target === "1W") {
      // ISO week starting Monday
      const day = (d.getUTCDay() + 6) % 7;
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
    }
    const step = TIMEFRAME_MS[target];
    return Math.floor(t / step) * step;
  };
  for (const c of candles) {
    const b = bucketOf(c.t);
    const last = out[out.length - 1];
    if (last && last.t === b) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else out.push({ t: b, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
  }
  return out;
}
