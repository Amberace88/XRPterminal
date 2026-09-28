/**
 * Historical market cycles (spec §44) and normalized cycle comparison (spec §45).
 *
 * Methodology (documented in the UI):
 * 1. Major pivots come from an asymmetric zig-zag on daily closes. A swing HIGH is confirmed once price
 *    has fallen ≥ `declinePct` from it; a swing LOW is confirmed once price has risen ≥ `rallyPct` from it.
 *    The dataset's first close is a candidate for both. Pivots alternate low/high.
 * 2. A cycle runs trough → peak → next trough. Return = peak ÷ start trough − 1; drawdown = end trough ÷ peak − 1.
 * 3. Recovery = days from the end trough until a close regains the cycle peak (null if never regained).
 * 4. Volatility = annualized standard deviation of daily log returns inside the cycle (√365).
 * 5. The current (incomplete) cycle starts at the last confirmed trough.
 * Cycles are descriptive labels applied after the fact; they do not imply future cycles will repeat.
 */
import type { Candle } from "@/lib/types/market";
import { logReturns, rollingVolatility, stdev } from "./indicators";
import { DAY_MS, daysBetween } from "./history";

export interface Pivot {
  i: number;
  t: number;
  price: number;
  kind: "high" | "low";
  /** Index at which the pivot became known (causal confirmation point). */
  confirmedAt: number;
}

export interface ZigZagResult {
  pivots: Pivot[];
  /** Unconfirmed running extreme after the last pivot. */
  tentative: { i: number; kind: "high" | "low" } | null;
}

export function zigzag(candles: Candle[], declinePct: number, rallyPct: number): ZigZagResult {
  const n = candles.length;
  const pivots: Pivot[] = [];
  if (n < 2) return { pivots, tentative: null };
  const down = declinePct / 100;
  const up = rallyPct / 100;
  let dir: 0 | 1 | -1 = 0;
  let hi = 0;
  let lo = 0;
  const push = (i: number, kind: "high" | "low", at: number) => pivots.push({ i, t: candles[i].t, price: candles[i].c, kind, confirmedAt: at });
  for (let i = 1; i < n; i++) {
    const c = candles[i].c;
    if (dir === 0) {
      if (c > candles[hi].c) hi = i;
      if (c < candles[lo].c) lo = i;
      if (hi < i && c <= candles[hi].c * (1 - down)) {
        push(hi, "high", i);
        dir = -1;
        lo = i;
      } else if (lo < i && c >= candles[lo].c * (1 + up)) {
        push(lo, "low", i);
        dir = 1;
        hi = i;
      }
    } else if (dir === 1) {
      if (c > candles[hi].c) hi = i;
      else if (c <= candles[hi].c * (1 - down)) {
        push(hi, "high", i);
        dir = -1;
        lo = i;
      }
    } else {
      if (c < candles[lo].c) lo = i;
      else if (c >= candles[lo].c * (1 + up)) {
        push(lo, "low", i);
        dir = 1;
        hi = i;
      }
    }
  }
  const tentative = dir === 1 ? { i: hi, kind: "high" as const } : dir === -1 ? { i: lo, kind: "low" as const } : null;
  return { pivots, tentative };
}

export interface Cycle {
  id: string;
  label: string;
  status: "complete" | "current";
  startIndex: number;
  startT: number;
  startPrice: number;
  highIndex: number;
  highT: number;
  high: number;
  /** End trough (complete cycles) or latest close (current cycle). */
  endIndex: number;
  endT: number;
  endPrice: number;
  /** Start → high, %. */
  returnPct: number;
  /** High → end trough (or latest close for the current cycle), % (≤ 0). */
  drawdownPct: number;
  durationDays: number;
  bullDays: number;
  bearDays: number;
  /** End trough → first close ≥ cycle high. */
  recoveryDays: number | null;
  recoveredT: number | null;
  /** Annualized realized volatility inside the cycle (fraction). */
  volatility: number | null;
  /** Whether the peak of the current cycle is confirmed by a ≥ declinePct fall. */
  peakConfirmed: boolean;
}

export interface CycleParams {
  declinePct: number;
  rallyPct: number;
}

export const CYCLE_PRESETS: { id: string; label: string; params: CycleParams }[] = [
  { id: "standard", label: "Standard (−50% / +100%)", params: { declinePct: 50, rallyPct: 100 } },
  { id: "major", label: "Major (−60% / +200%)", params: { declinePct: 60, rallyPct: 200 } },
  { id: "sensitive", label: "Sensitive (−40% / +80%)", params: { declinePct: 40, rallyPct: 80 } },
];

function windowVol(candles: Candle[], a: number, b: number): number | null {
  if (b - a < 10) return null;
  const r = logReturns(candles.slice(a, b + 1).map((k) => k.c)).filter((x): x is number => x !== null);
  return r.length >= 10 ? stdev(r) * Math.sqrt(365) : null;
}

const yr = (t: number) => new Date(t).getUTCFullYear();

export function detectCycles(candles: Candle[], params: CycleParams = CYCLE_PRESETS[0].params): { cycles: Cycle[]; pivots: Pivot[] } {
  const n = candles.length;
  if (n < 30) return { cycles: [], pivots: [] };
  const { pivots, tentative } = zigzag(candles, params.declinePct, params.rallyPct);
  const cycles: Cycle[] = [];
  const firstLow = pivots.findIndex((p) => p.kind === "low");
  if (firstLow < 0) return { cycles, pivots };

  const findRecovery = (from: number, level: number) => {
    for (let j = from + 1; j < n; j++) if (candles[j].c >= level) return j;
    return -1;
  };

  let k = firstLow;
  let num = 1;
  while (k < pivots.length) {
    const start = pivots[k];
    const peak = pivots[k + 1];
    const end = pivots[k + 2];
    if (peak && end) {
      const rec = findRecovery(end.i, peak.price);
      cycles.push({
        id: `c${num}`,
        label: `Cycle ${num} · ${yr(start.t)}–${yr(end.t)}`,
        status: "complete",
        startIndex: start.i,
        startT: start.t,
        startPrice: start.price,
        highIndex: peak.i,
        highT: peak.t,
        high: peak.price,
        endIndex: end.i,
        endT: end.t,
        endPrice: end.price,
        returnPct: (peak.price / start.price - 1) * 100,
        drawdownPct: (end.price / peak.price - 1) * 100,
        durationDays: daysBetween(start.t, end.t),
        bullDays: daysBetween(start.t, peak.t),
        bearDays: daysBetween(peak.t, end.t),
        recoveryDays: rec >= 0 ? daysBetween(end.t, candles[rec].t) : null,
        recoveredT: rec >= 0 ? candles[rec].t : null,
        volatility: windowVol(candles, start.i, end.i),
        peakConfirmed: true,
      });
      num++;
      k += 2;
      continue;
    }
    // current (incomplete) cycle from the last confirmed trough
    const last = n - 1;
    let highIdx: number;
    let peakConfirmed = false;
    if (peak) {
      highIdx = peak.i;
      peakConfirmed = true;
    } else {
      highIdx = start.i;
      for (let j = start.i; j <= last; j++) if (candles[j].c > candles[highIdx].c) highIdx = j;
      if (tentative?.kind === "high") highIdx = Math.max(highIdx, tentative.i);
    }
    const hi = candles[highIdx];
    cycles.push({
      id: "current",
      label: `Current cycle · since ${yr(start.t)}`,
      status: "current",
      startIndex: start.i,
      startT: start.t,
      startPrice: start.price,
      highIndex: highIdx,
      highT: hi.t,
      high: hi.c,
      endIndex: last,
      endT: candles[last].t,
      endPrice: candles[last].c,
      returnPct: (hi.c / start.price - 1) * 100,
      drawdownPct: (candles[last].c / hi.c - 1) * 100,
      durationDays: daysBetween(start.t, candles[last].t),
      bullDays: daysBetween(start.t, hi.t),
      bearDays: daysBetween(hi.t, candles[last].t),
      recoveryDays: null,
      recoveredT: null,
      volatility: windowVol(candles, start.i, last),
      peakConfirmed,
    });
    break;
  }
  return { cycles, pivots };
}

export interface NormalizedPoint {
  day: number;
  /** Close indexed to 100 at the anchor. */
  index: number;
  /** % below the running high since the anchor (≤ 0). */
  dd: number;
  /** Rolling 30D annualized volatility at that day (causal, fraction). */
  vol30: number | null;
}

/**
 * Normalize a cycle by days since its anchor (trough = cycle start, or peak = cycle high).
 * The window runs from the anchor to the cycle end (next trough) — or to the latest close for the current cycle —
 * optionally extended by `extendDays` beyond the end so post-cycle recovery can be compared.
 */
export function normalizeCycle(candles: Candle[], cycle: Cycle, anchor: "trough" | "peak" = "trough", extendDays = 0, maxDays = 5000): NormalizedPoint[] {
  const a = anchor === "trough" ? cycle.startIndex : cycle.highIndex;
  const endIdx = Math.min(candles.length - 1, cycle.endIndex + Math.max(0, Math.round(extendDays)));
  const base = candles[a]?.c;
  if (!base) return [];
  const vol = rollingVolatility(
    candles.slice(0, endIdx + 1).map((k) => k.c),
    30,
  );
  const out: NormalizedPoint[] = [];
  let runMax = -Infinity;
  for (let i = a; i <= endIdx; i++) {
    const day = Math.round((candles[i].t - candles[a].t) / DAY_MS);
    if (day > maxDays) break;
    const c = candles[i].c;
    if (c > runMax) runMax = c;
    out.push({ day, index: (c / base) * 100, dd: (c / runMax - 1) * 100, vol30: vol[i] });
  }
  return out;
}
