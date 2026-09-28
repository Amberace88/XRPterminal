/**
 * Historical Replay engine (spec §112–§114, §280–§283).
 *
 * At replay time T only candles with close time ≤ T are revealed. Orders placed at
 * T are executed by the SAME paper engine against the NEXT revealed candle:
 * market orders at its open ± slippage, resting limit/stop orders along a
 * deterministic intrabar path (bullish: O→L→H→C, bearish: O→H→L→C).
 */
import type { Candle } from "@/lib/types/market";
import { processTick, type CommandResult } from "./engine";
import type { AccountState, LedgerEvent, MarketSnapshot } from "./types";

export type ReplayTimeframe = "1D" | "1h";
export const REPLAY_TF_MS: Record<ReplayTimeframe, number> = { "1D": 86_400_000, "1h": 3_600_000 };
export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
/** 1x = one candle per second. */
export const speedToIntervalMs = (s: ReplaySpeed) => Math.round(1000 / s);

/** Close time of a candle (open time + duration − 1ms). */
export const closeTime = (c: Candle, tfMs: number) => c.t + tfMs - 1;

/** Candles visible at replay cursor index (inclusive). Never returns anything after the cursor. */
export function visibleCandles(all: Candle[], cursor: number): Candle[] {
  if (cursor < 0) return [];
  return all.slice(0, Math.min(cursor, all.length - 1) + 1);
}

/** Deterministic intrabar price path for one revealed candle. */
export function candlePath(c: Candle, tfMs: number, source = "Replay candle"): MarketSnapshot[] {
  const q = Math.floor(tfMs / 4);
  const bullish = c.c >= c.o;
  const mid = bullish ? [c.l, c.h] : [c.h, c.l];
  return [
    { price: c.o, t: c.t, quoteT: c.t, source: `${source} open` },
    { price: mid[0], t: c.t + q, quoteT: c.t + q, source: `${source} ${bullish ? "low" : "high"}` },
    { price: mid[1], t: c.t + 2 * q, quoteT: c.t + 2 * q, source: `${source} ${bullish ? "high" : "low"}` },
    { price: c.c, t: closeTime(c, tfMs), quoteT: closeTime(c, tfMs), source: `${source} close` },
  ];
}

/** Advance the replay account through one newly revealed candle. */
export function stepCandle(state: AccountState, c: Candle, tfMs: number): CommandResult {
  const path = candlePath(c, tfMs);
  let st = state;
  const events: LedgerEvent[] = [];
  path.forEach((snap, i) => {
    const r = processTick(st, snap, { markEveryTick: i === path.length - 1, noMark: i !== path.length - 1 });
    st = r.state;
    events.push(...r.events);
  });
  return { events, state: st };
}

/** Snapshot representing "now" in the replay: the close of the current candle. */
export function replaySnapshot(c: Candle, tfMs: number): MarketSnapshot {
  return { price: c.c, t: closeTime(c, tfMs), quoteT: closeTime(c, tfMs), source: "Replay candle close" };
}

export interface ReplayPerformance {
  returnPct: number;
  netPnl: number;
  trades: number;
  winRate: number | null;
  maxDrawdownPct: number;
  benchmarkReturnPct: number | null;
  fees: number;
}

export interface ReplaySession {
  id: string;
  name: string;
  market: "XRP-USD";
  timeframe: ReplayTimeframe;
  /** Replay start (first revealed candle open). */
  startT: number;
  /** Replay time reached (close of the last revealed candle). */
  endT: number;
  capital: number;
  accountId: string;
  events: LedgerEvent[];
  performance: ReplayPerformance;
  strategy: string;
  notes: string;
  createdAt: number;
  savedAt: number;
}
