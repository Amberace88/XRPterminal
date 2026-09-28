import type { Candle } from "@/lib/types/market";
import { alignByTime, logReturns, pearson, percentileRank, rollingVolatility } from "@/lib/analytics/indicators";
import { computeRegime, computeRisk } from "@/lib/analytics/regime";
import type { IntelSnapshot } from "./types";

/**
 * Pure snapshot metrics from daily candles (deterministic; unit-tested with fixtures).
 * `price` is the live ticker price when available, otherwise the last close.
 */
export function pctChange(from: number | undefined, to: number | null | undefined): number | null {
  if (from === undefined || to === null || to === undefined || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return (to / from - 1) * 100;
}

export function computeReturns(daily: Candle[], price: number | null): IntelSnapshot["returns"] {
  const n = daily.length;
  const p = price ?? daily[n - 1]?.c ?? null;
  const at = (k: number) => (n - 1 - k >= 0 ? daily[n - 1 - k].c : undefined);
  return { d1: pctChange(at(1), p), d7: pctChange(at(7), p), d30: pctChange(at(30), p), d90: pctChange(at(90), p) };
}

export function computeHistoryContext(daily: Candle[], price: number | null): Omit<IntelSnapshot["history"], "available" | "provenance" | "error"> {
  const n = daily.length;
  const closes = daily.map((c) => c.c);
  const p = price ?? closes[n - 1] ?? null;
  let athClose: number | null = null;
  let athDate: number | null = null;
  for (const c of daily) if (athClose === null || c.c > athClose) {
    athClose = c.c;
    athDate = c.t;
  }
  const last365 = daily.slice(-365);
  const high52w = last365.length ? Math.max(...last365.map((c) => c.h)) : null;
  const low52w = last365.length ? Math.min(...last365.map((c) => c.l)) : null;
  const windowRet = (k: number) => {
    const s: number[] = [];
    for (let j = k; j < n; j++) if (closes[j - k] > 0) s.push(closes[j] / closes[j - k] - 1);
    return s;
  };
  const cur30 = n > 30 && p !== null ? p / closes[n - 1 - 30] - 1 : null;
  const cur7 = n > 7 && p !== null ? p / closes[n - 1 - 7] - 1 : null;
  const v7 = n >= 7 ? daily.slice(-7).reduce((a, c) => a + c.v, 0) / 7 : null;
  const v30 = n >= 30 ? daily.slice(-30).reduce((a, c) => a + c.v, 0) / 30 : null;
  return {
    days: n,
    firstDate: n ? daily[0].t : null,
    athClose,
    athDate,
    pctFromAth: athClose && p !== null ? (p / athClose - 1) * 100 : null,
    high52w,
    low52w,
    ret30Percentile: cur30 !== null && n > 60 ? percentileRank(windowRet(30), cur30) : null,
    ret7Percentile: cur7 !== null && n > 30 ? percentileRank(windowRet(7), cur7) : null,
    volume7vs30: v7 !== null && v30 ? v7 / v30 : null,
  };
}

export function computeRegimeBlock(daily: Candle[], lagDays: number): { regime: IntelSnapshot["regime"]; risk: IntelSnapshot["risk"]; volatility: IntelSnapshot["volatility"] } {
  const reg = computeRegime(daily);
  const prev = daily.length - lagDays >= 220 ? computeRegime(daily.slice(0, daily.length - lagDays)) : null;
  const risk = computeRisk(daily, reg);
  const closes = daily.map((c) => c.c);
  const v7 = rollingVolatility(closes, 7);
  const current = reg.regime === "UNKNOWN" ? null : reg.regime;
  const previous = prev && prev.regime !== "UNKNOWN" ? prev.regime : null;
  return {
    regime: {
      current,
      previous,
      changed: current !== null && previous !== null && current !== previous,
      explanation: reg.regime === "UNKNOWN" ? null : reg.explanation,
      sma50: reg.metrics.sma50,
      sma200: reg.metrics.sma200,
      methodologyVersion: reg.methodologyVersion,
    },
    risk: {
      level: Number.isFinite(risk.score) ? risk.level : null,
      score: Number.isFinite(risk.score) ? risk.score : null,
      topComponents: [...risk.components].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3).map((c) => ({ name: c.name, detail: c.detail })),
      explanation: Number.isFinite(risk.score) ? risk.explanation : null,
    },
    volatility: {
      vol30Pct: reg.metrics.vol30 !== null ? reg.metrics.vol30 * 100 : null,
      vol7Pct: v7[v7.length - 1] !== null && v7.length ? (v7[v7.length - 1] as number) * 100 : null,
      percentile: reg.metrics.volPercentile,
    },
  };
}

/** Pearson correlation of aligned daily log returns over the last `window` days. */
export function returnCorrelation(a: Candle[], b: Candle[], window: number): number | null {
  const al = alignByTime(a, b);
  if (al.length < window + 1) return null;
  const tail = al.slice(-(window + 1));
  const ra = logReturns(tail.map((x) => x.a)).slice(1) as number[];
  const rb = logReturns(tail.map((x) => x.b)).slice(1) as number[];
  const pairs = ra.map((x, i) => [x, rb[i]] as const).filter(([x, y]) => x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y));
  return pearson(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
}

/** Statistical ±1σ range from annualized volatility (NOT a forecast). */
export function sigmaRange(price: number, annualVolPct: number, days: number): { low: number; high: number; sigmaPct: number } {
  const s = (annualVolPct / 100) * Math.sqrt(days / 365);
  return { low: price * Math.exp(-s), high: price * Math.exp(s), sigmaPct: s * 100 };
}
