/**
 * Simple baselines (spec §64): the scenario model must beat these to justify its complexity.
 * All baselines use ONLY candles ≤ as-of (caller slices) and output the same quantile band shape.
 *
 *  - persistence:   centre = last close; band = empirical H-day log-return spread recentred on 0.
 *  - ma20:          centre = 20-day simple moving average; same recentred empirical spread.
 *  - hist-median:   centre and band = raw empirical H-day return distribution (includes drift).
 *  - analogue:      quantiles of forward H-day returns from similar past conditions (trend state + vol tercile).
 *
 * Empirical H-day returns come from overlapping windows inside the trailing training window.
 */
import type { Candle } from "@/lib/types/market";
import { analogueForwardReturns, buildContext } from "./features";
import { DEFAULT_PARAMS } from "./model";
import { quantileSorted } from "./stats";
import type { BaselineResult } from "./types";

export type BaselineId = "persistence" | "ma20" | "hist-median" | "analogue";

export const BASELINES: { id: BaselineId; label: string; description: string }[] = [
  { id: "persistence", label: "Naive persistence", description: "Median = last close. Band = historical H-day return spread centred on zero." },
  { id: "ma20", label: "Moving average (20D)", description: "Median = 20-day simple moving average. Band = historical H-day return spread." },
  { id: "hist-median", label: "Historical median", description: "Median and band = raw distribution of historical H-day returns (trailing 4Y, includes drift)." },
  { id: "analogue", label: "Historical analogue", description: "Quantiles of H-day outcomes after past dates with the same 200D-trend state and volatility tercile." },
];

const LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] as const;
const MIN_WINDOWS = 30;

/** Sorted overlapping H-day log returns within the trailing training window. */
export function empiricalHorizonReturns(candles: Candle[], H: number, trainingWindowDays = DEFAULT_PARAMS.trainingWindowDays): Float64Array {
  const n = candles.length;
  const start = Math.max(0, n - 1 - trainingWindowDays - H);
  const count = Math.max(0, n - H - start);
  const out = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const i = start + k;
    out[k] = Math.log(candles[i + H].c / candles[i].c);
  }
  return out.sort();
}

function band(model: BaselineId, centre: number, logQ: number[], meta: { label: string; description: string }, note?: string): BaselineResult {
  const [p05, p10, p25, p50, p75, p90, p95] = logQ.map((q) => centre * Math.exp(q));
  return { model, label: meta.label, description: meta.description, available: true, p05, p10, p25, p50, p75, p90, p95, note };
}

function unavailable(id: BaselineId, note: string): BaselineResult {
  const meta = BASELINES.find((b) => b.id === id)!;
  return { model: id, label: meta.label, description: meta.description, available: false, note, p05: NaN, p10: NaN, p25: NaN, p50: NaN, p75: NaN, p90: NaN, p95: NaN };
}

export function runBaselines(candles: Candle[], H: number, only?: BaselineId[]): BaselineResult[] {
  const ids = only ?? BASELINES.map((b) => b.id);
  const n = candles.length;
  const last = candles[n - 1].c;
  const emp = empiricalHorizonReturns(candles, H);
  const enough = emp.length >= MIN_WINDOWS;
  const raw = enough ? LEVELS.map((q) => quantileSorted(emp, q)) : [];
  const centred = enough ? raw.map((v) => v - raw[3]) : [];
  const out: BaselineResult[] = [];
  for (const id of ids) {
    const meta = BASELINES.find((b) => b.id === id)!;
    if (id === "analogue") {
      const ctx = buildContext(candles, DEFAULT_PARAMS.trainingWindowDays);
      const a = analogueForwardReturns(ctx, H);
      if (!a || a.fwd.length < MIN_WINDOWS || a.independentN < 3) {
        out.push(unavailable(id, `Too few analogue dates (${a?.fwd.length ?? 0}, ~${a?.independentN ?? 0} independent).`));
        continue;
      }
      const logQ = LEVELS.map((q) => Math.log(1 + quantileSorted(a.fwd, q) / 100));
      out.push(band(id, last, logQ, meta, `${a.fwd.length} analogue dates, ~${a.independentN} independent.`));
      continue;
    }
    if (!enough) {
      out.push(unavailable(id, `Need ≥${MIN_WINDOWS} historical ${H}-day windows (have ${emp.length}).`));
      continue;
    }
    if (id === "persistence") out.push(band(id, last, centred, meta));
    else if (id === "hist-median") out.push(band(id, last, raw, meta));
    else if (id === "ma20") {
      if (n < 20) {
        out.push(unavailable(id, "Need 20 daily closes."));
        continue;
      }
      let s = 0;
      for (let i = n - 20; i < n; i++) s += candles[i].c;
      out.push(band(id, s / 20, centred, meta));
    }
  }
  return out;
}
