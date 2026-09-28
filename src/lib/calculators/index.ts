/**
 * Calculators (spec §128–130). Pure, deterministic functions — the UI only formats.
 * All percentages are expressed in percent units (5 = 5%).
 */

const finite = (...xs: number[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

/* ------------------------------ P&L ------------------------------ */
export interface PnlInput {
  side: "long" | "short";
  entry: number;
  exit: number;
  qty: number;
  feePct?: number; // per side, % of notional
}
export interface PnlResult {
  gross: number;
  fees: number;
  net: number;
  returnPct: number; // net / entry notional
  entryNotional: number;
  exitNotional: number;
  breakEvenExit: number;
}
export function pnl({ side, entry, exit, qty, feePct = 0 }: PnlInput): PnlResult | null {
  if (!finite(entry, exit, qty, feePct) || entry <= 0 || exit < 0 || qty <= 0 || feePct < 0) return null;
  const f = feePct / 100;
  const entryNotional = entry * qty;
  const exitNotional = exit * qty;
  const gross = side === "long" ? exitNotional - entryNotional : entryNotional - exitNotional;
  const fees = (entryNotional + exitNotional) * f;
  const net = gross - fees;
  // long: exit*q*(1-f) = entry*q*(1+f); short: entry*q*(1-f) = exit*q*(1+f)
  const breakEvenExit = side === "long" ? (entry * (1 + f)) / (1 - f) : (entry * (1 - f)) / (1 + f);
  return { gross, fees, net, returnPct: (net / entryNotional) * 100, entryNotional, exitNotional, breakEvenExit };
}

/* ------------------------- percentage change ------------------------- */
export function percentChange(from: number, to: number): number | null {
  if (!finite(from, to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}
export function applyPercent(value: number, pct: number): number | null {
  if (!finite(value, pct)) return null;
  return value * (1 + pct / 100);
}
/** Gain needed to recover from a loss of `lossPct` (e.g. −50% needs +100%). */
export function recoveryNeeded(lossPct: number): number | null {
  if (!finite(lossPct) || lossPct <= 0 || lossPct >= 100) return null;
  return (1 / (1 - lossPct / 100) - 1) * 100;
}

/* --------------------------- position size --------------------------- */
export interface PositionSizeInput {
  accountSize: number;
  riskPct: number; // % of account risked
  entry: number;
  stop: number;
  feePct?: number; // per side
}
export interface PositionSizeResult {
  riskAmount: number;
  perUnitRisk: number;
  qty: number;
  positionValue: number;
  accountShare: number; // position value / account, %
  stopDistancePct: number;
  side: "long" | "short";
}
export function positionSize({ accountSize, riskPct, entry, stop, feePct = 0 }: PositionSizeInput): PositionSizeResult | null {
  if (!finite(accountSize, riskPct, entry, stop, feePct) || accountSize <= 0 || riskPct <= 0 || riskPct > 100 || entry <= 0 || stop <= 0 || stop === entry) return null;
  const riskAmount = accountSize * (riskPct / 100);
  const f = feePct / 100;
  // fees on both legs count against the risk budget
  const perUnitRisk = Math.abs(entry - stop) + (entry + stop) * f;
  const qty = riskAmount / perUnitRisk;
  const positionValue = qty * entry;
  return {
    riskAmount,
    perUnitRisk,
    qty,
    positionValue,
    accountShare: (positionValue / accountSize) * 100,
    stopDistancePct: (Math.abs(entry - stop) / entry) * 100,
    side: stop < entry ? "long" : "short",
  };
}

/* ---------------------------- risk / reward ---------------------------- */
export interface RiskRewardResult {
  side: "long" | "short";
  risk: number;
  reward: number;
  ratio: number;
  breakevenWinRate: number; // %
  riskPct: number;
  rewardPct: number;
}
export function riskReward(entry: number, stop: number, target: number): RiskRewardResult | null {
  if (!finite(entry, stop, target) || entry <= 0 || stop === entry) return null;
  const side = stop < entry ? "long" : "short";
  const risk = Math.abs(entry - stop);
  const reward = side === "long" ? target - entry : entry - target;
  if (reward <= 0) return null;
  const ratio = reward / risk;
  return { side, risk, reward, ratio, breakevenWinRate: (1 / (1 + ratio)) * 100, riskPct: (risk / entry) * 100, rewardPct: (reward / entry) * 100 };
}

/* ------------------------------ compound ------------------------------ */
export interface CompoundResult {
  final: number;
  totalContributed: number;
  gain: number;
  gainPct: number;
  series: { period: number; value: number; contributed: number }[];
}
/** `ratePct` per period; contribution added at the END of each period. */
export function compound(principal: number, ratePct: number, periods: number, contribution = 0): CompoundResult | null {
  if (!finite(principal, ratePct, periods, contribution) || principal < 0 || periods < 0 || periods > 10_000 || contribution < 0 || ratePct <= -100) return null;
  const n = Math.floor(periods);
  let v = principal;
  let contributed = principal;
  const series = [{ period: 0, value: v, contributed }];
  for (let i = 1; i <= n; i++) {
    v = v * (1 + ratePct / 100) + contribution;
    contributed += contribution;
    series.push({ period: i, value: v, contributed });
  }
  return { final: v, totalContributed: contributed, gain: v - contributed, gainPct: contributed > 0 ? ((v - contributed) / contributed) * 100 : 0, series };
}

/* ------------------------------ drawdown ------------------------------ */
export function drawdownFromPeak(peak: number, current: number): { drawdownPct: number; recoveryPct: number } | null {
  if (!finite(peak, current) || peak <= 0 || current < 0 || current > peak) return null;
  const dd = (1 - current / peak) * 100;
  return { drawdownPct: dd, recoveryPct: dd >= 100 ? Infinity : (peak / current - 1) * 100 };
}
export function maxDrawdown(values: number[]): { maxDrawdownPct: number; peakIndex: number; troughIndex: number } | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  let peakI = 0;
  let best = { maxDrawdownPct: 0, peakIndex: 0, troughIndex: 0 };
  for (let i = 1; i < v.length; i++) {
    if (v[i] > v[peakI]) peakI = i;
    const dd = v[peakI] > 0 ? (1 - v[i] / v[peakI]) * 100 : 0;
    if (dd > best.maxDrawdownPct) best = { maxDrawdownPct: dd, peakIndex: peakI, troughIndex: i };
  }
  return best;
}

/* -------------------------- scenario / portfolio -------------------------- */
export interface ScenarioResult {
  currentValue: number;
  scenarioValue: number;
  absChange: number;
  pctChange: number;
}
/** Hypothetical scenario (spec §129) — NOT a prediction. */
export function scenario(xrpAmount: number, currentPrice: number, scenarioPrice: number): ScenarioResult | null {
  if (!finite(xrpAmount, currentPrice, scenarioPrice) || xrpAmount < 0 || currentPrice <= 0 || scenarioPrice < 0) return null;
  const currentValue = xrpAmount * currentPrice;
  const scenarioValue = xrpAmount * scenarioPrice;
  return { currentValue, scenarioValue, absChange: scenarioValue - currentValue, pctChange: (scenarioPrice / currentPrice - 1) * 100 };
}

export interface Holding {
  asset: string;
  qty: number;
  price: number;
  scenarioPrice: number;
}
export function portfolioScenario(holdings: Holding[]) {
  const rows = holdings
    .filter((h) => finite(h.qty, h.price, h.scenarioPrice) && h.qty >= 0 && h.price >= 0 && h.scenarioPrice >= 0)
    .map((h) => ({ ...h, value: h.qty * h.price, scenarioValue: h.qty * h.scenarioPrice }));
  const value = rows.reduce((a, r) => a + r.value, 0);
  const scenarioValue = rows.reduce((a, r) => a + r.scenarioValue, 0);
  return {
    rows: rows.map((r) => ({ ...r, weight: value > 0 ? (r.value / value) * 100 : 0, change: r.scenarioValue - r.value })),
    value,
    scenarioValue,
    absChange: scenarioValue - value,
    pctChange: value > 0 ? (scenarioValue / value - 1) * 100 : null,
  };
}

/* --------------------------------- DCA --------------------------------- */
export type DcaFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export const FREQ_DAYS: Record<DcaFrequency, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30.4375 };

export interface DcaInput {
  initial: number; // fiat invested at the first purchase
  recurring: number; // fiat per subsequent purchase
  prices: number[]; // price at each purchase (index 0 = initial)
  valuationPrice?: number; // defaults to last path price
  feePct?: number;
}
export interface DcaResult {
  purchases: number;
  contributions: number;
  fees: number;
  xrp: number;
  avgCost: number; // contributions (incl. fees) / xrp
  value: number;
  pnl: number;
  pnlPct: number;
  schedule: { i: number; price: number; invested: number; xrpBought: number; totalXrp: number; totalInvested: number; value: number }[];
}
export function dca({ initial, recurring, prices, valuationPrice, feePct = 0 }: DcaInput): DcaResult | null {
  if (!prices.length || !finite(initial, recurring, feePct) || initial < 0 || recurring < 0 || feePct < 0 || feePct >= 100) return null;
  if (prices.some((p) => !Number.isFinite(p) || p <= 0)) return null;
  const f = feePct / 100;
  let xrp = 0;
  let invested = 0;
  let fees = 0;
  const schedule: DcaResult["schedule"] = [];
  prices.forEach((p, i) => {
    const amt = i === 0 ? initial : recurring;
    if (amt <= 0) {
      schedule.push({ i, price: p, invested: 0, xrpBought: 0, totalXrp: xrp, totalInvested: invested, value: xrp * p });
      return;
    }
    const fee = amt * f;
    const bought = (amt - fee) / p;
    xrp += bought;
    invested += amt;
    fees += fee;
    schedule.push({ i, price: p, invested: amt, xrpBought: bought, totalXrp: xrp, totalInvested: invested, value: xrp * p });
  });
  const vp = valuationPrice ?? prices[prices.length - 1];
  const value = xrp * vp;
  return {
    purchases: schedule.filter((s) => s.invested > 0).length,
    contributions: invested,
    fees,
    xrp,
    avgCost: xrp > 0 ? invested / xrp : NaN,
    value,
    pnl: value - invested,
    pnlPct: invested > 0 ? (value / invested - 1) * 100 : 0,
    schedule,
  };
}

/** Assumed price paths for the DCA calculator — assumptions, never forecasts. */
export function flatPath(price: number, n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, () => price);
}
export function linearPath(start: number, target: number, n: number): number[] {
  if (n <= 1) return n === 1 ? [start] : [];
  return Array.from({ length: n }, (_, i) => start + ((target - start) * i) / (n - 1));
}
/**
 * Historical replay: sample actual daily closes every `stepDays`, ending at the latest candle,
 * `n` purchases long. Returns prices oldest → newest (fewer if history is shorter).
 */
export function historicalPath(daily: { t: number; c: number }[], stepDays: number, n: number): { prices: number[]; dates: number[] } {
  const prices: number[] = [];
  const dates: number[] = [];
  if (!daily.length || n <= 0) return { prices, dates };
  const last = daily[daily.length - 1].t;
  const byIndex = daily;
  for (let k = n - 1; k >= 0; k--) {
    const target = last - Math.round(k * stepDays) * 86_400_000;
    // latest candle at or before target (no lookahead)
    let lo = 0;
    let hi = byIndex.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (byIndex[mid].t <= target) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found >= 0) {
      prices.push(byIndex[found].c);
      dates.push(byIndex[found].t);
    }
  }
  return { prices, dates };
}

/* -------------------------------- fees -------------------------------- */
export function tradeFee(notional: number, feePct: number): number | null {
  if (!finite(notional, feePct) || notional < 0 || feePct < 0) return null;
  return notional * (feePct / 100);
}
export interface RoundTripFees {
  entryFee: number;
  exitFee: number;
  total: number;
  totalPctOfEntry: number;
  breakEvenMovePct: number; // price move needed to cover fees (long)
}
export function roundTripFees(qty: number, entry: number, exit: number, makerOrTakerPct: number, exitFeePct = makerOrTakerPct): RoundTripFees | null {
  if (!finite(qty, entry, exit, makerOrTakerPct, exitFeePct) || qty <= 0 || entry <= 0 || exit < 0 || makerOrTakerPct < 0 || exitFeePct < 0) return null;
  const a = makerOrTakerPct / 100;
  const b = exitFeePct / 100;
  const entryFee = qty * entry * a;
  const exitFee = qty * exit * b;
  return {
    entryFee,
    exitFee,
    total: entryFee + exitFee,
    totalPctOfEntry: ((entryFee + exitFee) / (qty * entry)) * 100,
    breakEvenMovePct: ((1 + a) / (1 - b) - 1) * 100,
  };
}

/* ------------------------------ slippage ------------------------------ */
export interface SlippageResult {
  slippagePct: number; // adverse = positive
  cost: number; // adverse cost in quote currency (positive = worse)
}
export function slippage(side: "buy" | "sell", expectedPrice: number, fillPrice: number, qty: number): SlippageResult | null {
  if (!finite(expectedPrice, fillPrice, qty) || expectedPrice <= 0 || fillPrice <= 0 || qty <= 0) return null;
  const diff = side === "buy" ? fillPrice - expectedPrice : expectedPrice - fillPrice;
  return { slippagePct: (diff / expectedPrice) * 100, cost: diff * qty };
}
export function applySlippage(side: "buy" | "sell", price: number, bps: number): number | null {
  if (!finite(price, bps) || price <= 0) return null;
  return side === "buy" ? price * (1 + bps / 10_000) : price * (1 - bps / 10_000);
}

/* ---------------------------- market cap ---------------------------- */
/** Implied market cap at price X = X × circulating supply (educational, not a target). */
export function impliedMarketCap(price: number, supply: number): number | null {
  if (!finite(price, supply) || price < 0 || supply <= 0) return null;
  return price * supply;
}
export function impliedPrice(marketCap: number, supply: number): number | null {
  if (!finite(marketCap, supply) || marketCap < 0 || supply <= 0) return null;
  return marketCap / supply;
}
