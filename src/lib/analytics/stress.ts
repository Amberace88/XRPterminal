/**
 * Historical stress testing (spec §54). HYPOTHETICAL: applies price moves measured in past episodes
 * to a user-entered position. It does not predict that any scenario will occur.
 *
 * Scenarios (all derived from the loaded daily data — nothing hard-coded except the calendar windows):
 * 1. Worst 30-day XRP decline: the most negative peak-to-trough decline inside any rolling 30-day window.
 * 2. 2018 bear market: XRP peak-to-trough decline within calendar year 2018 (requires data coverage).
 * 3. COVID crash: XRP peak-to-trough decline between 2020-02-01 and 2020-03-31.
 * 4. BTC stress × XRP beta: BTC's worst 30-day decline, translated to XRP via the trailing 365D
 *    beta of XRP daily log returns on BTC daily log returns: XRP log move = β × BTC log move.
 * 5. Volatility spike: a 2-sigma 30-day down move at the 95th percentile of historical 30D realized
 *    volatility: move = exp(−2 × σ95 × √(30/365)) − 1.
 * Liquidity-reduction scenarios are not modelled: no historical order-book depth is connected.
 */
import type { Candle } from "@/lib/types/market";
import { quantile, rollingVolatility } from "./indicators";
import { DAY_MS, indexAtOrAfter } from "./history";
import { alignedLogReturns, beta } from "./correlation";

export interface StressScenario {
  id: string;
  name: string;
  /** Price move applied to XRP, % (negative = loss). */
  movePct: number;
  windowStart: number | null;
  windowEnd: number | null;
  detail: string;
  method: string;
}

/** Most negative peak-to-trough decline fully inside any window of `days` calendar days. */
export function worstWindowDecline(candles: Candle[], days = 30): { pct: number; peakT: number; troughT: number } | null {
  if (candles.length < 2) return null;
  let best: { pct: number; peakT: number; troughT: number } | null = null;
  // For each trough j, the peak is the max close within the preceding `days` days.
  const dq: number[] = []; // indices with decreasing closes (monotonic deque for window max)
  for (let j = 0; j < candles.length; j++) {
    const from = candles[j].t - days * DAY_MS;
    while (dq.length && candles[dq[0]].t < from) dq.shift();
    if (dq.length) {
      const p = dq[0];
      const pct = (candles[j].c / candles[p].c - 1) * 100;
      if (!best || pct < best.pct) best = { pct, peakT: candles[p].t, troughT: candles[j].t };
    }
    while (dq.length && candles[dq[dq.length - 1]].c <= candles[j].c) dq.pop();
    dq.push(j);
  }
  return best && best.pct < 0 ? best : null;
}

/** Peak-to-trough decline (peak before trough) inside [from, to]. null if the window isn't covered. */
export function windowDecline(candles: Candle[], from: number, to: number): { pct: number; peakT: number; troughT: number } | null {
  if (!candles.length || candles[0].t > from + 3 * DAY_MS || candles[candles.length - 1].t < to - 3 * DAY_MS) return null;
  const a = indexAtOrAfter(candles, from);
  let peak = a;
  let best: { pct: number; peakT: number; troughT: number } | null = null;
  for (let i = a; i < candles.length && candles[i].t <= to; i++) {
    if (candles[i].c > candles[peak].c) peak = i;
    const pct = (candles[i].c / candles[peak].c - 1) * 100;
    if (!best || pct < best.pct) best = { pct, peakT: candles[peak].t, troughT: candles[i].t };
  }
  return best && best.pct < 0 ? best : null;
}

export function buildStressScenarios(xrp: Candle[], btc?: Candle[] | null): { scenarios: StressScenario[]; betaXrpBtc: number | null; betaN: number } {
  const scenarios: StressScenario[] = [];
  const w30 = worstWindowDecline(xrp, 30);
  if (w30)
    scenarios.push({
      id: "xrp-worst-30d",
      name: "Worst 30-day XRP decline",
      movePct: w30.pct,
      windowStart: w30.peakT,
      windowEnd: w30.troughT,
      detail: "Largest peak-to-trough fall inside any 30-day window of the dataset.",
      method: "Rolling 30-day window max close → subsequent close.",
    });
  const b18 = windowDecline(xrp, Date.UTC(2018, 0, 1), Date.UTC(2018, 11, 31));
  if (b18)
    scenarios.push({
      id: "bear-2018",
      name: "2018 bear market",
      movePct: b18.pct,
      windowStart: b18.peakT,
      windowEnd: b18.troughT,
      detail: "XRP peak-to-trough decline within calendar year 2018.",
      method: "Max close in 2018 before the lowest subsequent 2018 close.",
    });
  const covid = windowDecline(xrp, Date.UTC(2020, 1, 1), Date.UTC(2020, 2, 31));
  if (covid)
    scenarios.push({
      id: "covid-2020",
      name: "COVID crash (Feb–Mar 2020)",
      movePct: covid.pct,
      windowStart: covid.peakT,
      windowEnd: covid.troughT,
      detail: "XRP peak-to-trough decline between 1 Feb and 31 Mar 2020.",
      method: "Max close in window before the lowest subsequent close in window.",
    });

  let betaXrpBtc: number | null = null;
  let betaN = 0;
  if (btc && btc.length > 60) {
    const pairs = alignedLogReturns(xrp, btc);
    const last = pairs.length ? pairs[pairs.length - 1].t : 0;
    const sub = pairs.filter((p) => p.t > last - 365 * DAY_MS);
    betaN = sub.length;
    betaXrpBtc = sub.length >= 180 ? beta(sub) : null;
    const bw = worstWindowDecline(btc, 30);
    if (bw && betaXrpBtc !== null) {
      const move = (Math.exp(betaXrpBtc * Math.log(1 + bw.pct / 100)) - 1) * 100;
      scenarios.push({
        id: "btc-beta",
        name: "Largest BTC 30-day decline × XRP beta",
        movePct: move,
        windowStart: bw.peakT,
        windowEnd: bw.troughT,
        detail: `BTC fell ${bw.pct.toFixed(1)}%; applied with XRP's trailing 365D beta of ${betaXrpBtc.toFixed(2)} (N=${betaN} daily pairs).`,
        method: "XRP log move = β × BTC log move. β = cov(XRP, BTC) ÷ var(BTC) of daily log returns.",
      });
    }
  }

  const vol = rollingVolatility(
    xrp.map((k) => k.c),
    30,
  ).filter((x): x is number => x !== null);
  if (vol.length > 100) {
    const s95 = quantile([...vol].sort((a, b) => a - b), 0.95);
    const move = (Math.exp(-2 * s95 * Math.sqrt(30 / 365)) - 1) * 100;
    scenarios.push({
      id: "vol-spike",
      name: "Volatility spike (2σ, 95th pct vol)",
      movePct: move,
      windowStart: null,
      windowEnd: null,
      detail: `A 2-sigma 30-day decline at the 95th-percentile 30D realized volatility (${(s95 * 100).toFixed(0)}% annualized).`,
      method: "move = exp(−2 × σ95 × √(30/365)) − 1.",
    });
  }
  return { scenarios, betaXrpBtc, betaN };
}

export interface StressOutcome {
  scenarioId: string;
  before: number;
  after: number;
  change: number;
  changePct: number;
}

/**
 * Apply a scenario to a position. `xrpValue` is the XRP position value; `otherValue` (optional) is held constant
 * (e.g. cash/stablecoins) so the portfolio-level percentage reflects only the XRP exposure.
 */
export function applyStress(xrpValue: number, movePct: number, otherValue = 0): Omit<StressOutcome, "scenarioId"> {
  const x = Math.max(0, xrpValue);
  const o = Math.max(0, otherValue);
  const before = x + o;
  const after = x * (1 + Math.max(-100, movePct) / 100) + o;
  const change = after - before;
  return { before, after, change, changePct: before > 0 ? (change / before) * 100 : 0 };
}
