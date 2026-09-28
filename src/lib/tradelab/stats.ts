/**
 * Trade Lab performance statistics (spec §108, §109, §110, §275–§279).
 * Deterministic, computed in code from SIMULATED trades and the equity curve.
 */
import type { ClosedTrade, EquityPoint } from "./types";

export interface DrawdownDetail {
  maxDrawdownPct: number;
  maxDrawdownAbs: number;
  peakT: number | null;
  peakEquity: number | null;
  troughT: number | null;
  troughEquity: number | null;
  /** Time equity regained the prior peak, or null if not yet recovered. */
  recoveryT: number | null;
  /** Peak → recovery (or → last point if unrecovered), ms. */
  durationMs: number | null;
  currentDrawdownPct: number;
}

export interface DrawdownPoint {
  t: number;
  drawdownPct: number;
}

export function drawdownSeries(curve: { t: number; equity: number }[]): DrawdownPoint[] {
  let peak = -Infinity;
  return curve.map((p) => {
    peak = Math.max(peak, p.equity);
    return { t: p.t, drawdownPct: peak > 0 ? -((peak - p.equity) / peak) * 100 : 0 };
  });
}

/** Max drawdown with peak, trough, recovery and duration (spec §276). */
export function drawdownDetail(curve: { t: number; equity: number }[]): DrawdownDetail {
  const empty: DrawdownDetail = { maxDrawdownPct: 0, maxDrawdownAbs: 0, peakT: null, peakEquity: null, troughT: null, troughEquity: null, recoveryT: null, durationMs: null, currentDrawdownPct: 0 };
  if (!curve.length) return empty;
  let peak = curve[0].equity;
  let peakT = curve[0].t;
  let best = { dd: 0, abs: 0, peakT: curve[0].t, peak: curve[0].equity, troughT: curve[0].t, trough: curve[0].equity };
  for (const p of curve) {
    if (p.equity > peak) {
      peak = p.equity;
      peakT = p.t;
    }
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    if (dd > best.dd) best = { dd, abs: peak - p.equity, peakT, peak, troughT: p.t, trough: p.equity };
  }
  if (best.dd === 0) {
    const last = curve[curve.length - 1];
    return { ...empty, peakT, peakEquity: peak, currentDrawdownPct: peak > 0 ? ((peak - last.equity) / peak) * 100 : 0 };
  }
  let recoveryT: number | null = null;
  for (const p of curve) {
    if (p.t > best.troughT && p.equity >= best.peak) {
      recoveryT = p.t;
      break;
    }
  }
  const last = curve[curve.length - 1];
  const runPeak = curve.reduce((m, p) => Math.max(m, p.equity), -Infinity);
  return {
    maxDrawdownPct: best.dd,
    maxDrawdownAbs: best.abs,
    peakT: best.peakT,
    peakEquity: best.peak,
    troughT: best.troughT,
    troughEquity: best.trough,
    recoveryT,
    durationMs: (recoveryT ?? last.t) - best.peakT,
    currentDrawdownPct: runPeak > 0 ? ((runPeak - last.equity) / runPeak) * 100 : 0,
  };
}

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  avgHoldingMs: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  totalFees: number;
  totalSlippage: number;
  returnPct: number;
  expectancy: number | null;
  avgR: number | null;
  tradesWithR: number;
  /** Per-trade return Sharpe-like ratio — only when n ≥ 20 (statistically meaningful threshold). */
  perTradeSharpe: number | null;
  /** Std-dev of per-trade returns (%), a consistency measure. */
  returnStdev: number | null;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function sd(a: number[]): number | null {
  if (a.length < 2) return null;
  const m = mean(a) as number;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
}

export const MIN_TRADES_FOR_RISK_ADJUSTED = 20;

/** Trade statistics (spec §277). `startingCapital` drives the return %. */
export function tradeStats(trades: ClosedTrade[], startingCapital: number, finalEquity?: number): TradeStats {
  const pnl = trades.map((t) => t.netPnl);
  const winsA = pnl.filter((x) => x > 0);
  const lossA = pnl.filter((x) => x < 0);
  const grossProfit = winsA.reduce((a, b) => a + b, 0);
  const grossLoss = -lossA.reduce((a, b) => a + b, 0);
  const net = pnl.reduce((a, b) => a + b, 0);
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null && Number.isFinite(r));
  const rets = trades.map((t) => t.returnPct);
  const retSd = sd(rets);
  let cw = 0,
    cl = 0,
    mw = 0,
    ml = 0;
  for (const x of pnl) {
    if (x > 0) {
      cw++;
      cl = 0;
    } else if (x < 0) {
      cl++;
      cw = 0;
    } else {
      cw = 0;
      cl = 0;
    }
    mw = Math.max(mw, cw);
    ml = Math.max(ml, cl);
  }
  const eq = finalEquity ?? startingCapital + net;
  return {
    totalTrades: trades.length,
    wins: winsA.length,
    losses: lossA.length,
    breakeven: pnl.filter((x) => x === 0).length,
    winRate: trades.length ? (winsA.length / trades.length) * 100 : null,
    avgWin: mean(winsA),
    avgLoss: mean(lossA),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    largestWin: winsA.length ? Math.max(...winsA) : null,
    largestLoss: lossA.length ? Math.min(...lossA) : null,
    avgHoldingMs: mean(trades.map((t) => t.holdingMs)),
    grossProfit,
    grossLoss,
    netPnl: net,
    totalFees: trades.reduce((a, t) => a + t.fees, 0),
    totalSlippage: trades.reduce((a, t) => a + t.slippageCost, 0),
    returnPct: startingCapital > 0 ? (eq / startingCapital - 1) * 100 : 0,
    expectancy: mean(pnl),
    avgR: mean(rs),
    tradesWithR: rs.length,
    perTradeSharpe: trades.length >= MIN_TRADES_FOR_RISK_ADJUSTED && retSd && retSd > 0 ? (mean(rets) as number) / retSd : null,
    returnStdev: retSd,
    maxConsecutiveLosses: ml,
    maxConsecutiveWins: mw,
  };
}

export interface BenchmarkPoint {
  t: number;
  strategy: number;
  benchmark: number;
}

/**
 * Buy-and-hold XRP benchmark (spec §109): same starting capital, same period.
 * Buys at the first observed price of the period, paying the same taker fee once.
 */
export function buyAndHold(curve: EquityPoint[], startingCapital: number, takerFeePct: number): { points: BenchmarkPoint[]; benchmarkReturnPct: number | null; strategyReturnPct: number | null; entryPrice: number | null } {
  if (!curve.length) return { points: [], benchmarkReturnPct: null, strategyReturnPct: null, entryPrice: null };
  const p0 = curve[0].price;
  const qty = (startingCapital * (1 - takerFeePct / 100)) / p0;
  const points = curve.map((p) => ({ t: p.t, strategy: p.equity, benchmark: qty * p.price }));
  const last = points[points.length - 1];
  return {
    points,
    entryPrice: p0,
    benchmarkReturnPct: (last.benchmark / startingCapital - 1) * 100,
    strategyReturnPct: (last.strategy / startingCapital - 1) * 100,
  };
}

/** Benchmark from a price path (candles) for backtests / replay. */
export function buyAndHoldFromPrices(prices: { t: number; price: number }[], startingCapital: number, takerFeePct: number): { t: number; value: number }[] {
  if (!prices.length) return [];
  const qty = (startingCapital * (1 - takerFeePct / 100)) / prices[0].price;
  return prices.map((p) => ({ t: p.t, value: qty * p.price }));
}

export interface TradeQuality {
  id: string;
  plannedEntry: number | null;
  actualEntry: number;
  entrySlippagePct: number | null;
  plannedRisk: number | null;
  actualRisk: number | null;
  /** How much of the move while open was captured: (exit − low) / (high − low). 1 = sold at the high. */
  exitEfficiency: number | null;
  /** Where the entry sat within the range while open: 0 = bought the low. */
  entryTiming: number | null;
  rMultiple: number | null;
  slippageCost: number;
  fees: number;
  hadStop: boolean;
}

/** Trade quality metrics (spec §110). High/low are sampled from mark-to-market points (approximate). */
export function tradeQuality(t: ClosedTrade): TradeQuality {
  const range = t.highWhileOpen - t.lowWhileOpen;
  return {
    id: t.id,
    plannedEntry: t.plannedEntry,
    actualEntry: t.avgEntry,
    entrySlippagePct: t.plannedEntry ? ((t.avgEntry - t.plannedEntry) / t.plannedEntry) * 100 : null,
    plannedRisk: t.plannedRisk,
    actualRisk: t.initialRisk,
    exitEfficiency: range > 0 ? Math.max(0, Math.min(1, (t.avgExit - t.lowWhileOpen) / range)) : null,
    entryTiming: range > 0 ? Math.max(0, Math.min(1, (t.avgEntry - t.lowWhileOpen) / range)) : null,
    rMultiple: t.rMultiple,
    slippageCost: t.slippageCost,
    fees: t.fees,
    hadStop: t.initialStop !== null,
  };
}

export interface Scorecard {
  strategyReturnPct: number | null;
  benchmarkReturnPct: number | null;
  differencePct: number | null;
  maxDrawdownPct: number;
  profitFactor: number | null;
  winRate: number | null;
  tradeCount: number;
  /** Share of calendar months (with trades) that were net positive. */
  consistencyPct: number | null;
  monthsWithTrades: number;
}

export function monthlyPnl(trades: ClosedTrade[]): { month: string; pnl: number; trades: number }[] {
  const m = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const d = new Date(t.closedAt);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const v = m.get(k) ?? { pnl: 0, trades: 0 };
    v.pnl += t.netPnl;
    v.trades += 1;
    m.set(k, v);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

/** Strategy scorecard (spec §279) — deliberately no single composite "best" score. */
export function scorecard(stats: TradeStats, dd: DrawdownDetail, bench: { benchmarkReturnPct: number | null; strategyReturnPct: number | null }, trades: ClosedTrade[]): Scorecard {
  const months = monthlyPnl(trades);
  return {
    strategyReturnPct: bench.strategyReturnPct ?? stats.returnPct,
    benchmarkReturnPct: bench.benchmarkReturnPct,
    differencePct: bench.benchmarkReturnPct !== null && bench.strategyReturnPct !== null ? bench.strategyReturnPct - bench.benchmarkReturnPct : null,
    maxDrawdownPct: dd.maxDrawdownPct,
    profitFactor: stats.profitFactor,
    winRate: stats.winRate,
    tradeCount: stats.totalTrades,
    consistencyPct: months.length ? (months.filter((x) => x.pnl > 0).length / months.length) * 100 : null,
    monthsWithTrades: months.length,
  };
}
