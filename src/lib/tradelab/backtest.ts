/**
 * Strategy Lab — rule builder model + backtest engine (spec §115–§118, §284–§287).
 *
 * Integrity rules (spec §117):
 * - Data after the test end is never passed to indicators (the series is sliced first).
 * - Every indicator is causal: value[i] uses candles[0..i] only.
 * - Signals are evaluated at the CLOSE of bar i and executed at the OPEN of bar i+1.
 * - Stops / targets are checked intrabar from the entry bar on; if both could have been
 *   hit in the same bar, the STOP is assumed first (conservative).
 * - Warm-up bars before the start date are real past data (available at that time).
 * Backtests are SIMULATED, hypothetical and use float math (analysis, not a ledger).
 */
import { atr, ema, macd, percentileRank, rollingVolatility, rsi, sma } from "@/lib/analytics/indicators";
import type { Candle } from "@/lib/types/market";
import { drawdownDetail, tradeStats, type DrawdownDetail, type TradeStats } from "./stats";
import type { ClosedTrade } from "./types";

export type IndicatorId =
  | "PRICE"
  | "OPEN"
  | "HIGH"
  | "LOW"
  | "VOLUME"
  | "VOLUME_SMA"
  | "SMA"
  | "EMA"
  | "RSI"
  | "MACD"
  | "MACD_SIGNAL"
  | "MACD_HIST"
  | "ATR"
  | "ATR_PCT"
  | "VOLATILITY"
  | "RETURN"
  | "HIGHEST"
  | "LOWEST"
  | "XRPBTC"
  | "XRPBTC_SMA";

export interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  period?: { default: number; min: number; max: number };
  unit: "price" | "pct" | "index" | "volume" | "ratio";
  needs?: "btc";
  dailyOnly?: boolean;
  help: string;
}

export const INDICATORS: IndicatorMeta[] = [
  { id: "PRICE", label: "Close price", unit: "price", help: "Bar close (USD)." },
  { id: "OPEN", label: "Open price", unit: "price", help: "Bar open (USD)." },
  { id: "HIGH", label: "High", unit: "price", help: "Bar high (USD)." },
  { id: "LOW", label: "Low", unit: "price", help: "Bar low (USD)." },
  { id: "SMA", label: "SMA", period: { default: 50, min: 2, max: 400 }, unit: "price", help: "Simple moving average of closes." },
  { id: "EMA", label: "EMA", period: { default: 21, min: 2, max: 400 }, unit: "price", help: "Exponential moving average of closes." },
  { id: "RSI", label: "RSI", period: { default: 14, min: 2, max: 100 }, unit: "index", help: "Wilder's RSI (0–100)." },
  { id: "MACD", label: "MACD line (12/26)", unit: "price", help: "EMA12 − EMA26." },
  { id: "MACD_SIGNAL", label: "MACD signal (9)", unit: "price", help: "EMA9 of the MACD line." },
  { id: "MACD_HIST", label: "MACD histogram", unit: "price", help: "MACD − signal." },
  { id: "ATR", label: "ATR", period: { default: 14, min: 2, max: 100 }, unit: "price", help: "Wilder's Average True Range (USD)." },
  { id: "ATR_PCT", label: "ATR % of price", period: { default: 14, min: 2, max: 100 }, unit: "pct", help: "ATR ÷ close × 100." },
  { id: "VOLATILITY", label: "Realized volatility (ann. %)", period: { default: 30, min: 5, max: 365 }, unit: "pct", help: "Annualized stdev of log returns × 100 (365-day annualization)." },
  { id: "RETURN", label: "Return over N bars %", period: { default: 7, min: 1, max: 365 }, unit: "pct", help: "(close ÷ close N bars ago − 1) × 100." },
  { id: "HIGHEST", label: "Resistance: highest high (prior N)", period: { default: 20, min: 2, max: 400 }, unit: "price", help: "Highest high of the previous N bars (excludes the current bar)." },
  { id: "LOWEST", label: "Support: lowest low (prior N)", period: { default: 20, min: 2, max: 400 }, unit: "price", help: "Lowest low of the previous N bars (excludes the current bar)." },
  { id: "VOLUME", label: "Volume (XRP)", unit: "volume", help: "Bar base volume." },
  { id: "VOLUME_SMA", label: "Volume SMA", period: { default: 20, min: 2, max: 400 }, unit: "volume", help: "Average bar volume." },
  { id: "XRPBTC", label: "XRP/BTC ratio", unit: "ratio", needs: "btc", dailyOnly: true, help: "XRP-USD close ÷ BTC-USD close (same UTC day)." },
  { id: "XRPBTC_SMA", label: "XRP/BTC SMA", period: { default: 50, min: 2, max: 400 }, unit: "ratio", needs: "btc", dailyOnly: true, help: "Moving average of the XRP/BTC ratio." },
];
export const indicatorMeta = (id: IndicatorId) => INDICATORS.find((x) => x.id === id) as IndicatorMeta;

export type Operand = { kind: "value"; value: number } | { kind: "ind"; ind: IndicatorId; period?: number };
export type CompareOp = "gt" | "lt" | "gte" | "lte" | "crossAbove" | "crossBelow";
export type RegimeLabel = "TRENDING UP" | "TRENDING DOWN" | "RANGE" | "HIGH VOLATILITY" | "LOW VOLATILITY" | "TRANSITION";
export const REGIME_LABELS: RegimeLabel[] = ["TRENDING UP", "TRENDING DOWN", "RANGE", "HIGH VOLATILITY", "LOW VOLATILITY", "TRANSITION"];

export type Condition =
  | { id: string; type: "compare"; left: Operand; op: CompareOp; right: Operand }
  | { id: string; type: "regime"; regime: RegimeLabel; negate?: boolean };

export interface RuleGroup {
  logic: "AND" | "OR";
  conditions: Condition[];
}

export interface StrategyRules {
  entry: RuleGroup;
  exit: RuleGroup;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  /** % of available cash allocated per entry (1–100). */
  positionSizePct: number;
}

export interface StrategyVersion {
  version: number;
  rules: StrategyRules;
  createdAt: number;
  note: string | null;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  version: number;
  rules: StrategyRules;
  versions: StrategyVersion[];
  createdAt: number;
  updatedAt: number;
  /** Number of backtests run across all versions (multiple-testing awareness). */
  backtestRuns: number;
}

export const OP_LABEL: Record<CompareOp, string> = { gt: ">", lt: "<", gte: "≥", lte: "≤", crossAbove: "crosses above", crossBelow: "crosses below" };

export function describeOperand(o: Operand): string {
  if (o.kind === "value") return String(o.value);
  const m = indicatorMeta(o.ind);
  return m.period ? `${m.label.split(" (")[0]}(${o.period ?? m.period.default})` : m.label;
}
export function describeCondition(c: Condition): string {
  if (c.type === "regime") return `Regime ${c.negate ? "is not" : "is"} ${c.regime}`;
  return `${describeOperand(c.left)} ${OP_LABEL[c.op]} ${describeOperand(c.right)}`;
}

/** Create a strategy (version 1). */
export function createStrategy(id: string, name: string, rules: StrategyRules, t: number, description = ""): Strategy {
  return { id, name, description, version: 1, rules, versions: [{ version: 1, rules, createdAt: t, note: "Initial version" }], createdAt: t, updatedAt: t, backtestRuns: 0 };
}

const rulesKey = (r: StrategyRules) =>
  JSON.stringify({
    ...r,
    entry: { ...r.entry, conditions: r.entry.conditions.map(({ id: _id, ...c }) => c) },
    exit: { ...r.exit, conditions: r.exit.conditions.map(({ id: _id, ...c }) => c) },
  });

/** Changing rules creates a NEW version; identical rules keep the current version (spec §211). */
export function saveStrategyVersion(s: Strategy, rules: StrategyRules, t: number, note: string | null = null): Strategy {
  if (rulesKey(rules) === rulesKey(s.rules)) return s;
  const version = s.version + 1;
  return { ...s, version, rules, versions: [...s.versions, { version, rules, createdAt: t, note }], updatedAt: t };
}

export function parameterCount(r: StrategyRules): number {
  const cond = [...r.entry.conditions, ...r.exit.conditions];
  let p = 0;
  for (const c of cond) {
    p += 1;
    if (c.type === "compare") {
      if (c.left.kind === "ind" && indicatorMeta(c.left.ind).period) p += 1;
      if (c.right.kind === "ind" && indicatorMeta(c.right.ind).period) p += 1;
      if (c.right.kind === "value") p += 1;
    }
  }
  if (r.stopLossPct) p += 1;
  if (r.takeProfitPct) p += 1;
  return p;
}

/* ------------------------------------------------------------------ */
/* Indicator context                                                   */

export type Series = (number | null)[];

function smaNullable(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v === null) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

/** Causal per-bar regime using the same rules as computeRegime (percentile vs history up to i). */
export function regimeSeries(c: Candle[]): (RegimeLabel | null)[] {
  const closes = c.map((k) => k.c);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const vol = rollingVolatility(closes, 30);
  const hist: number[] = [];
  const out: (RegimeLabel | null)[] = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    const v = vol[i];
    if (v !== null) hist.push(v);
    if (i < 219) continue;
    const close = closes[i];
    const a50 = s50[i];
    const a200 = s200[i];
    const prev50 = s50[i - 20];
    const slope = a50 !== null && prev50 !== null ? (a50 / prev50 - 1) * 100 : null;
    const pct = v !== null ? percentileRank(hist, v) : null;
    const above50 = a50 !== null && close > a50;
    const above200 = a200 !== null && close > a200;
    const up = above50 && above200 && a50 !== null && a200 !== null && a50 > a200 && (slope ?? 0) > 2;
    const down = !above50 && !above200 && a50 !== null && a200 !== null && a50 < a200 && (slope ?? 0) < -2;
    if (pct !== null && pct >= 85) out[i] = "HIGH VOLATILITY";
    else if (up) out[i] = "TRENDING UP";
    else if (down) out[i] = "TRENDING DOWN";
    else if (pct !== null && pct <= 15) out[i] = "LOW VOLATILITY";
    else if (above50 !== above200) out[i] = "TRANSITION";
    else out[i] = "RANGE";
  }
  return out;
}

export class IndicatorContext {
  private cache = new Map<string, Series>();
  private regimes: (RegimeLabel | null)[] | null = null;
  readonly closes: number[];
  constructor(
    readonly candles: Candle[],
    readonly btc: Candle[] | null = null,
  ) {
    this.closes = candles.map((k) => k.c);
  }

  series(ind: IndicatorId, period?: number): Series {
    const m = indicatorMeta(ind);
    const p = m.period ? Math.round(Math.min(m.period.max, Math.max(m.period.min, period ?? m.period.default))) : 0;
    const key = `${ind}:${p}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const c = this.candles;
    const closes = this.closes;
    let out: Series;
    switch (ind) {
      case "PRICE":
        out = closes;
        break;
      case "OPEN":
        out = c.map((k) => k.o);
        break;
      case "HIGH":
        out = c.map((k) => k.h);
        break;
      case "LOW":
        out = c.map((k) => k.l);
        break;
      case "VOLUME":
        out = c.map((k) => k.v);
        break;
      case "VOLUME_SMA":
        out = sma(c.map((k) => k.v), p);
        break;
      case "SMA":
        out = sma(closes, p);
        break;
      case "EMA":
        out = ema(closes, p);
        break;
      case "RSI":
        out = rsi(closes, p);
        break;
      case "MACD":
        out = macd(closes).macd;
        break;
      case "MACD_SIGNAL":
        out = macd(closes).signal;
        break;
      case "MACD_HIST":
        out = macd(closes).hist;
        break;
      case "ATR":
        out = atr(c, p);
        break;
      case "ATR_PCT": {
        const a = atr(c, p);
        out = a.map((v, i) => (v === null ? null : (v / closes[i]) * 100));
        break;
      }
      case "VOLATILITY":
        out = rollingVolatility(closes, p).map((v) => (v === null ? null : v * 100));
        break;
      case "RETURN":
        out = closes.map((v, i) => (i >= p && closes[i - p] > 0 ? (v / closes[i - p] - 1) * 100 : null));
        break;
      case "HIGHEST":
        out = c.map((_, i) => (i >= p ? Math.max(...c.slice(i - p, i).map((k) => k.h)) : null));
        break;
      case "LOWEST":
        out = c.map((_, i) => (i >= p ? Math.min(...c.slice(i - p, i).map((k) => k.l)) : null));
        break;
      case "XRPBTC":
      case "XRPBTC_SMA": {
        let ratio: Series = new Array(c.length).fill(null);
        if (this.btc) {
          const day = (t: number) => Math.floor(t / 86_400_000);
          const bm = new Map(this.btc.map((k) => [day(k.t), k.c]));
          ratio = c.map((k) => {
            const b = bm.get(day(k.t));
            return b && b > 0 ? k.c / b : null;
          });
        }
        out = ind === "XRPBTC" ? ratio : smaNullable(ratio, p);
        break;
      }
    }
    this.cache.set(key, out);
    return out;
  }

  value(o: Operand, i: number): number | null {
    if (o.kind === "value") return Number.isFinite(o.value) ? o.value : null;
    if (i < 0) return null;
    const v = this.series(o.ind, o.period)[i];
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  }

  regime(i: number): RegimeLabel | null {
    if (!this.regimes) this.regimes = regimeSeries(this.candles);
    return this.regimes[i] ?? null;
  }
}

export function evalCondition(ctx: IndicatorContext, c: Condition, i: number): boolean {
  if (c.type === "regime") {
    const r = ctx.regime(i);
    if (r === null) return false;
    return c.negate ? r !== c.regime : r === c.regime;
  }
  const l = ctx.value(c.left, i);
  const r = ctx.value(c.right, i);
  if (l === null || r === null) return false;
  switch (c.op) {
    case "gt":
      return l > r;
    case "lt":
      return l < r;
    case "gte":
      return l >= r;
    case "lte":
      return l <= r;
    case "crossAbove":
    case "crossBelow": {
      const lp = ctx.value(c.left, i - 1);
      const rp = ctx.value(c.right, i - 1);
      if (lp === null || rp === null) return false;
      return c.op === "crossAbove" ? lp <= rp && l > r : lp >= rp && l < r;
    }
  }
}

export function evalGroup(ctx: IndicatorContext, g: RuleGroup, i: number): boolean {
  if (!g.conditions.length) return false;
  return g.logic === "AND" ? g.conditions.every((c) => evalCondition(ctx, c, i)) : g.conditions.some((c) => evalCondition(ctx, c, i));
}

/** Signals at each bar's close. entry[i]/exit[i] depend on candles[0..i] only. */
export function computeSignals(candles: Candle[], rules: StrategyRules, btc: Candle[] | null = null): { entry: boolean[]; exit: boolean[] } {
  const ctx = new IndicatorContext(candles, btc);
  return {
    entry: candles.map((_, i) => evalGroup(ctx, rules.entry, i)),
    exit: candles.map((_, i) => evalGroup(ctx, rules.exit, i)),
  };
}

/* ------------------------------------------------------------------ */
/* Backtest                                                             */

export interface BacktestConfig {
  from: number;
  to: number;
  capital: number;
  feePct: number;
  slippageBps: number;
  timeframe: "1D" | "1h";
}

export type ExitReason = "SIGNAL" | "STOP" | "TARGET" | "END_OF_TEST";

export interface BacktestTrade extends ClosedTrade {
  entrySignalT: number;
  exitReason: ExitReason;
  bars: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  rulesVersion: number | null;
  bars: number;
  warmupBars: number;
  firstT: number | null;
  lastT: number | null;
  trades: BacktestTrade[];
  equity: { t: number; equity: number; benchmark: number; close: number }[];
  stats: TradeStats;
  drawdown: DrawdownDetail;
  finalEquity: number;
  returnPct: number;
  netPnl: number;
  benchmarkReturnPct: number | null;
  exposurePct: number;
  assumptions: string[];
  warnings: string[];
  ranAt: number;
}

export function backtestAssumptions(cfg: BacktestConfig, rules: StrategyRules): string[] {
  return [
    "SIMULATED hypothetical results on historical candles — not real trades.",
    `Signals are evaluated at the close of each ${cfg.timeframe} bar and executed at the next bar's open (no lookahead).`,
    `Fills: next open ± ${cfg.slippageBps} bps slippage; ${cfg.feePct}% fee on every entry and exit.`,
    `Position size: ${rules.positionSizePct}% of available cash per entry; long-only, one position at a time.`,
    rules.stopLossPct || rules.takeProfitPct
      ? `Stops/targets checked intrabar from the entry bar (stop ${rules.stopLossPct ?? "—"}%, target ${rules.takeProfitPct ?? "—"}%). If both are touched in one bar the stop is assumed first. Gaps fill at the open.`
      : "No stop-loss / take-profit: exits only on the exit rule or the end of the test.",
    "An open position at the end of the test is closed at the last close for measurement.",
    "Indicators use only data available up to each bar; warm-up bars before the start date are prior history.",
    "Survivorship: a single, continuously traded pair (XRP-USD) from one data provider; exchange outages and liquidity are not modelled.",
  ];
}

export function runBacktest(allCandles: Candle[], rules: StrategyRules, cfg: BacktestConfig, opts: { btc?: Candle[] | null; ranAt: number; rulesVersion?: number | null }): BacktestResult {
  // Hide the future: slice everything after `to` BEFORE any computation (spec §117).
  const candles = allCandles.filter((k) => k.t <= cfg.to);
  const startIdx = candles.findIndex((k) => k.t >= cfg.from);
  const ctx = new IndicatorContext(candles, opts.btc?.filter((k) => k.t <= cfg.to) ?? null);
  const fee = cfg.feePct / 100;
  const slip = cfg.slippageBps / 10_000;
  const trades: BacktestTrade[] = [];
  const equity: BacktestResult["equity"] = [];
  let cash = cfg.capital;
  let qty = 0;
  let pendingEntry: number | null = null; // signal bar time
  let pendingExit = false;
  let entry: { t: number; price: number; fee: number; slip: number; signalT: number; stop: number | null; target: number | null; idx: number; high: number; low: number } | null = null;
  let barsInMarket = 0;
  const benchQty = startIdx >= 0 ? (cfg.capital * (1 - fee)) / candles[startIdx].o : 0;

  const exit = (i: number, price: number, reason: ExitReason, slipCost: number) => {
    if (!entry) return;
    const k = candles[i];
    const gross = qty * price;
    const f = gross * fee;
    cash += gross - f;
    const grossPnl = (price - entry.price) * qty;
    const fees = entry.fee + f;
    const net = grossPnl - fees;
    const cost = entry.price * qty;
    const risk = entry.stop !== null ? (entry.price - entry.stop) * qty : null;
    trades.push({
      id: `bt${trades.length + 1}`,
      version: 0,
      openedAt: entry.t,
      closedAt: k.t,
      holdingMs: k.t - entry.t,
      qty,
      avgEntry: entry.price,
      avgExit: price,
      grossPnl,
      fees,
      netPnl: net,
      returnPct: cost > 0 ? (net / cost) * 100 : 0,
      slippageCost: entry.slip + slipCost,
      initialStop: entry.stop,
      initialTarget: entry.target,
      initialRisk: risk,
      rMultiple: risk && risk > 0 ? net / risk : null,
      plannedEntry: null,
      plannedRisk: risk,
      exitRoles: [reason === "STOP" ? "STOP_LOSS" : reason === "TARGET" ? "TAKE_PROFIT" : "EXIT"],
      entryOrderId: null,
      highWhileOpen: Math.max(entry.high, k.h),
      lowWhileOpen: Math.min(entry.low, k.l),
      entrySignalT: entry.signalT,
      exitReason: reason,
      bars: i - entry.idx + 1,
    });
    qty = 0;
    entry = null;
  };

  if (startIdx >= 0) {
    for (let i = startIdx; i < candles.length; i++) {
      const k = candles[i];
      // 1) execute orders decided at the previous close, at this bar's open
      if (pendingExit && qty > 0) {
        const px = k.o * (1 - slip);
        exit(i, px, "SIGNAL", (k.o - px) * qty);
      }
      pendingExit = false;
      if (pendingEntry !== null && qty === 0) {
        const px = k.o * (1 + slip);
        const alloc = cash * (Math.min(100, Math.max(1, rules.positionSizePct)) / 100);
        const q = Math.floor((alloc / (px * (1 + fee))) * 1e6) / 1e6;
        if (q > 0) {
          const f = q * px * fee;
          cash -= q * px + f;
          qty = q;
          entry = {
            t: k.t,
            price: px,
            fee: f,
            slip: (px - k.o) * q,
            signalT: pendingEntry,
            stop: rules.stopLossPct ? px * (1 - rules.stopLossPct / 100) : null,
            target: rules.takeProfitPct ? px * (1 + rules.takeProfitPct / 100) : null,
            idx: i,
            high: k.o,
            low: k.o,
          };
        }
      }
      pendingEntry = null;
      // 2) intrabar stop / target (stop first when ambiguous)
      if (entry && qty > 0) {
        barsInMarket++;
        if (entry.stop !== null && k.l <= entry.stop) {
          const base = Math.min(k.o, entry.stop);
          const px = base * (1 - slip);
          exit(i, px, "STOP", (base - px) * qty);
        } else if (entry.target !== null && k.h >= entry.target) {
          const px = Math.max(k.o, entry.target);
          exit(i, px, "TARGET", 0);
        } else {
          entry.high = Math.max(entry.high, k.h);
          entry.low = Math.min(entry.low, k.l);
        }
      }
      // 3) decide at this bar's close (executes next bar)
      if (i < candles.length - 1) {
        if (qty === 0 && evalGroup(ctx, rules.entry, i)) pendingEntry = k.t;
        else if (qty > 0 && evalGroup(ctx, rules.exit, i)) pendingExit = true;
      }
      equity.push({ t: k.t, equity: cash + qty * k.c, benchmark: benchQty * k.c, close: k.c });
    }
    if (qty > 0 && entry) {
      const last = candles.length - 1;
      const px = candles[last].c * (1 - slip);
      exit(last, px, "END_OF_TEST", (candles[last].c - px) * qty);
      equity[equity.length - 1] = { ...equity[equity.length - 1], equity: cash };
    }
  }
  const finalEquity = equity.length ? equity[equity.length - 1].equity : cfg.capital;
  const stats = tradeStats(trades, cfg.capital, finalEquity);
  const dd = drawdownDetail(equity);
  const lastB = equity.length ? equity[equity.length - 1].benchmark : null;
  const result: BacktestResult = {
    config: cfg,
    rulesVersion: opts.rulesVersion ?? null,
    bars: equity.length,
    warmupBars: Math.max(0, startIdx),
    firstT: equity[0]?.t ?? null,
    lastT: equity[equity.length - 1]?.t ?? null,
    trades,
    equity,
    stats,
    drawdown: dd,
    finalEquity,
    returnPct: (finalEquity / cfg.capital - 1) * 100,
    netPnl: finalEquity - cfg.capital,
    benchmarkReturnPct: lastB !== null ? (lastB / cfg.capital - 1) * 100 : null,
    exposurePct: equity.length ? (barsInMarket / equity.length) * 100 : 0,
    assumptions: backtestAssumptions(cfg, rules),
    warnings: [],
    ranAt: opts.ranAt,
  };
  return result;
}

/** Heuristic overfitting / low-evidence warnings (spec §287). */
export function overfittingWarnings(r: BacktestResult, rules: StrategyRules, runsOnStrategy = 0): string[] {
  const w: string[] = [];
  const n = r.stats.totalTrades;
  const params = parameterCount(rules);
  if (n === 0) w.push("No trades were generated — the rules never triggered in this period.");
  else if (n < 10) w.push(`Only ${n} trade(s): far too few to draw conclusions.`);
  else if (n < 30) w.push(`Small sample (${n} trades): statistics are fragile and can change a lot with a few trades.`);
  if (r.stats.winRate !== null && r.stats.winRate >= 80 && n < 50 && n > 0) w.push(`Win rate of ${r.stats.winRate.toFixed(0)}% on ${n} trades is unusually high — a common sign of curve fitting.`);
  if (n > 0 && n / Math.max(1, params) < 10) w.push(`${params} rule parameters for ${n} trades (< 10 trades per parameter): rules may be tailored to this specific history.`);
  if (r.stats.profitFactor !== null && r.stats.profitFactor > 3 && n < 30) w.push(`Profit factor ${Number.isFinite(r.stats.profitFactor) ? r.stats.profitFactor.toFixed(2) : "∞"} on few trades is likely not robust.`);
  if (runsOnStrategy >= 10) w.push(`${runsOnStrategy} backtests run on this strategy: testing many variations and keeping the best inflates results (multiple-testing bias).`);
  if (r.benchmarkReturnPct !== null && n > 0 && n < 20 && r.returnPct - r.benchmarkReturnPct > 100) w.push("Large outperformance vs buy-and-hold from a handful of trades — verify on a different period (out-of-sample).");
  if (w.length) w.push("Past optimization does not guarantee future performance.");
  return w;
}

export const STRATEGY_TEMPLATES: { name: string; description: string; rules: StrategyRules }[] = [
  {
    name: "RSI mean reversion in uptrend",
    description: "Buy oversold RSI while price is above the 200 EMA; exit when RSI recovers.",
    rules: {
      entry: {
        logic: "AND",
        conditions: [
          { id: "c1", type: "compare", left: { kind: "ind", ind: "RSI", period: 14 }, op: "lt", right: { kind: "value", value: 30 } },
          { id: "c2", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "gt", right: { kind: "ind", ind: "EMA", period: 200 } },
        ],
      },
      exit: { logic: "OR", conditions: [{ id: "c3", type: "compare", left: { kind: "ind", ind: "RSI", period: 14 }, op: "gt", right: { kind: "value", value: 60 } }] },
      stopLossPct: 2,
      takeProfitPct: 5,
      positionSizePct: 100,
    },
  },
  {
    name: "50/200 SMA trend follow",
    description: "Enter when SMA50 crosses above SMA200; exit on the cross back below.",
    rules: {
      entry: { logic: "AND", conditions: [{ id: "c1", type: "compare", left: { kind: "ind", ind: "SMA", period: 50 }, op: "crossAbove", right: { kind: "ind", ind: "SMA", period: 200 } }] },
      exit: { logic: "OR", conditions: [{ id: "c2", type: "compare", left: { kind: "ind", ind: "SMA", period: 50 }, op: "crossBelow", right: { kind: "ind", ind: "SMA", period: 200 } }] },
      stopLossPct: null,
      takeProfitPct: null,
      positionSizePct: 100,
    },
  },
  {
    name: "20-bar breakout",
    description: "Buy a close above the prior 20-bar high; exit below the prior 10-bar low.",
    rules: {
      entry: { logic: "AND", conditions: [{ id: "c1", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "gt", right: { kind: "ind", ind: "HIGHEST", period: 20 } }] },
      exit: { logic: "OR", conditions: [{ id: "c2", type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "lt", right: { kind: "ind", ind: "LOWEST", period: 10 } }] },
      stopLossPct: 8,
      takeProfitPct: null,
      positionSizePct: 100,
    },
  },
];
