import type { ClosedTrade, TraderMetrics } from "./types";

/**
 * Trader metrics & leaderboard scoring (spec §84, §86). Deterministic.
 * Leaderboards are NEVER ranked by ROI alone: the composite score blends risk-adjusted
 * return, consistency, drawdown, profit factor and sample size, and traders with
 * insufficient data are excluded.
 */
export const MIN_TRADES = 20;
export const MIN_SPAN_DAYS = 30;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function meanStd(xs: number[]): { mean: number; std: number } {
  const n = xs.length;
  if (!n) return { mean: NaN, std: NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, std: NaN };
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, std: Math.sqrt(v) };
}

/** Max drawdown (%) of an equity curve (positive number, e.g. 23.4). */
export function maxDrawdownPct(equity: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) maxDd = Math.max(maxDd, (1 - e / peak) * 100);
  }
  return maxDd;
}

export function computeTraderMetrics(
  trades: ClosedTrade[],
  opts: { source?: TraderMetrics["source"]; quoteAsset?: string | null; now?: number } = {},
): TraderMetrics {
  const now = opts.now ?? Date.now();
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const n = sorted.length;
  const base: TraderMetrics = {
    source: opts.source ?? "XRPL_DEX",
    quoteAsset: opts.quoteAsset ?? null,
    tradeCount: n,
    wins: 0,
    losses: 0,
    winRate: null,
    totalPnl: null,
    roiPct: null,
    profitFactor: null,
    avgReturnPct: null,
    stdevReturnPct: null,
    riskAdjusted: null,
    maxDrawdownPct: null,
    avgHoldingMs: null,
    consistency: null,
    monthsCovered: 0,
    firstTradeAt: n ? sorted[0].entryTime : null,
    lastTradeAt: n ? sorted[n - 1].exitTime : null,
    eligible: false,
    ineligibleReason: `Needs at least ${MIN_TRADES} closed trades over ${MIN_SPAN_DAYS}+ days.`,
    score: null,
    computedAt: now,
  };
  if (!n) return base;

  const rets = sorted.map((t) => t.returnPct);
  const wins = sorted.filter((t) => t.pnl > 0).length;
  const losses = sorted.filter((t) => t.pnl < 0).length;
  const grossProfit = sorted.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -sorted.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0);
  const { mean, std } = meanStd(rets);
  // equity curve assuming each trade compounds full allocation (normalised, start = 1)
  const equity = [1];
  for (const r of rets) equity.push(equity[equity.length - 1] * (1 + r / 100));
  const monthly = new Map<string, number>();
  for (const t of sorted) {
    const d = new Date(t.exitTime);
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthly.set(k, (monthly.get(k) ?? 0) + t.pnl);
  }
  const months = [...monthly.values()];
  const spanDays = ((base.lastTradeAt ?? 0) - (base.firstTradeAt ?? 0)) / 86_400_000;

  const m: TraderMetrics = {
    ...base,
    wins,
    losses,
    winRate: wins / n,
    totalPnl: sorted.reduce((a, t) => a + t.pnl, 0),
    roiPct: (equity[equity.length - 1] - 1) * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    avgReturnPct: mean,
    stdevReturnPct: Number.isFinite(std) ? std : null,
    riskAdjusted: Number.isFinite(std) && std > 0 ? mean / std : null,
    maxDrawdownPct: maxDrawdownPct(equity),
    avgHoldingMs: sorted.reduce((a, t) => a + t.holdingMs, 0) / n,
    consistency: months.length >= 2 ? months.filter((p) => p > 0).length / months.length : null,
    monthsCovered: months.length,
  };
  if (n >= MIN_TRADES && spanDays >= MIN_SPAN_DAYS) {
    m.eligible = true;
    m.ineligibleReason = undefined;
    m.score = leaderboardScore(m);
  } else {
    m.ineligibleReason =
      n < MIN_TRADES ? `Only ${n} closed trade${n === 1 ? "" : "s"} (minimum ${MIN_TRADES}).` : `History spans ${Math.floor(spanDays)} days (minimum ${MIN_SPAN_DAYS}).`;
  }
  return m;
}

export const SCORE_WEIGHTS = { riskAdjusted: 0.35, consistency: 0.2, drawdown: 0.2, profitFactor: 0.15, sampleSize: 0.1 } as const;

/** Composite 0–100. Components are documented on the leaderboard. */
export function leaderboardScore(m: Pick<TraderMetrics, "riskAdjusted" | "consistency" | "maxDrawdownPct" | "profitFactor" | "tradeCount">): number {
  const ra = m.riskAdjusted === null ? 0.5 : clamp01(0.5 + m.riskAdjusted / 2);
  const cons = m.consistency ?? 0.5;
  const dd = m.maxDrawdownPct === null ? 0.5 : 1 - clamp01(m.maxDrawdownPct / 60);
  const pf = m.profitFactor === null ? 0.5 : m.profitFactor === Infinity ? 1 : clamp01(m.profitFactor / (m.profitFactor + 1));
  const ss = clamp01(Math.log10(Math.max(1, m.tradeCount)) / Math.log10(200));
  const w = SCORE_WEIGHTS;
  return Math.round((w.riskAdjusted * ra + w.consistency * cons + w.drawdown * dd + w.profitFactor * pf + w.sampleSize * ss) * 1000) / 10;
}

export type LeaderboardSort = "score" | "riskAdjusted" | "consistency" | "drawdown" | "sample";

export function rankTraders<T extends { metrics: TraderMetrics | null }>(rows: T[], sort: LeaderboardSort = "score"): T[] {
  const eligible = rows.filter((r) => r.metrics?.eligible);
  const key = (r: T): number => {
    const m = r.metrics!;
    switch (sort) {
      case "riskAdjusted":
        return m.riskAdjusted ?? -Infinity;
      case "consistency":
        return m.consistency ?? -Infinity;
      case "drawdown":
        return -(m.maxDrawdownPct ?? Infinity);
      case "sample":
        return m.tradeCount;
      default:
        return m.score ?? -Infinity;
    }
  };
  return eligible.sort((a, b) => key(b) - key(a));
}

/* ------------------------------------------------------------------ */
/* Simulated mimic (spec §87, §290) — hypothetical, NOT copy trading.   */

export interface MimicParams {
  capital: number;
  allocationPct: number; // % of current equity per trade
  feePct: number; // per side
  slippageBps: number; // per side, adverse
}

export interface MimicRow {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  positionValue: number;
  fees: number;
  slippageCost: number;
  result: number;
  equityAfter: number;
}

export interface MimicResult {
  rows: MimicRow[];
  startEquity: number;
  endEquity: number;
  returnPct: number;
  totalFees: number;
  totalSlippage: number;
  maxDrawdownPct: number;
}

export function simulateMimic(trades: ClosedTrade[], p: MimicParams): MimicResult {
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  let equity = p.capital;
  const eq = [equity];
  const rows: MimicRow[] = [];
  let totalFees = 0;
  let totalSlip = 0;
  const slip = p.slippageBps / 10_000;
  const fee = p.feePct / 100;
  for (const t of sorted) {
    const positionValue = Math.max(0, equity * (p.allocationPct / 100));
    if (positionValue <= 0 || t.entryPrice <= 0) break;
    const entry = t.entryPrice * (1 + slip);
    const exit = t.exitPrice * (1 - slip);
    const qty = positionValue / (entry * (1 + fee));
    const entryFee = qty * entry * fee;
    const exitFee = qty * exit * fee;
    const slippageCost = qty * (entry - t.entryPrice) + qty * (t.exitPrice - exit);
    const result = qty * exit - exitFee - (qty * entry + entryFee);
    equity += result;
    totalFees += entryFee + exitFee;
    totalSlip += slippageCost;
    eq.push(equity);
    rows.push({ entryTime: t.entryTime, exitTime: t.exitTime, entryPrice: entry, exitPrice: exit, qty, positionValue, fees: entryFee + exitFee, slippageCost, result, equityAfter: equity });
  }
  return {
    rows,
    startEquity: p.capital,
    endEquity: equity,
    returnPct: (equity / p.capital - 1) * 100,
    totalFees,
    totalSlippage: totalSlip,
    maxDrawdownPct: maxDrawdownPct(eq),
  };
}
