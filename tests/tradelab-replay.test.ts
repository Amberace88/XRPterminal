import { describe, expect, it } from "vitest";
import { createAccount, placeOrder, processTick, replayEvents } from "@/lib/tradelab/engine";
import { REPLAY_TF_MS, candlePath, closeTime, replaySnapshot, stepCandle, visibleCandles } from "@/lib/tradelab/replay";
import { DEFAULT_SETTINGS, type AccountState, type LedgerEvent } from "@/lib/tradelab/types";
import type { Candle } from "@/lib/types/market";

const TF = REPLAY_TF_MS["1h"];
const T0 = Date.UTC(2024, 5, 1);
const candles: Candle[] = [
  { t: T0, o: 1.0, h: 1.02, l: 0.99, c: 1.01, v: 1 },
  { t: T0 + TF, o: 1.05, h: 1.08, l: 1.04, c: 1.07, v: 1 },
  { t: T0 + 2 * TF, o: 1.07, h: 1.07, l: 0.9, c: 0.92, v: 1 },
  { t: T0 + 3 * TF, o: 0.92, h: 0.95, l: 0.91, c: 0.94, v: 1 },
];
const noSlip = { ...DEFAULT_SETTINGS, slippage: { ...DEFAULT_SETTINGS.slippage, fixedBps: 0 } };

function start(): { state: AccountState; events: LedgerEvent[] } {
  const c = createAccount({ accountId: "replay-x", startingCapital: 10_000, settings: noSlip, t: closeTime(candles[0], TF), mode: "REPLAY" });
  const m = processTick(c.state, replaySnapshot(candles[0], TF), { markEveryTick: true });
  return { state: m.state, events: [...c.events, ...m.events] };
}

describe("historical replay", () => {
  it("never reveals candles after the cursor", () => {
    expect(visibleCandles(candles, 1)).toEqual(candles.slice(0, 2));
    expect(visibleCandles(candles, -1)).toEqual([]);
    expect(visibleCandles(candles, 99)).toEqual(candles);
  });

  it("builds a deterministic intrabar path (bullish O→L→H→C, bearish O→H→L→C)", () => {
    expect(candlePath(candles[1], TF).map((s) => s.price)).toEqual([1.05, 1.04, 1.08, 1.07]);
    expect(candlePath(candles[2], TF).map((s) => s.price)).toEqual([1.07, 1.07, 0.9, 0.92]);
    const ts = candlePath(candles[1], TF).map((s) => s.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(ts[3]).toBeLessThan(candles[2].t);
  });

  it("a market order placed at candle i close fills at candle i+1 open (no peeking)", () => {
    let { state } = start();
    const events: LedgerEvent[] = [];
    const nowT = closeTime(candles[0], TF);
    const r = placeOrder(state, { side: "BUY", type: "MARKET", qty: 1000 }, replaySnapshot(candles[0], TF), nowT, { deferToNextTick: true });
    expect(r.rejection).toBeNull();
    state = r.state;
    events.push(...r.events);
    expect(state.fills).toHaveLength(0); // not filled at the known close
    const s = stepCandle(state, candles[1], TF);
    state = s.state;
    expect(state.fills).toHaveLength(1);
    expect(state.fills[0].price).toBe("1.05"); // next open, zero slippage configured
    expect(state.fills[0].t).toBe(candles[1].t);
  });

  it("deferred orders arrive at the next open: marketable limits fill there as taker, resting ones as maker", () => {
    const { state } = start();
    const nowT = closeTime(candles[0], TF);
    const r = placeOrder(state, { side: "BUY", type: "LIMIT", qty: 100, limitPrice: 1.1 }, replaySnapshot(candles[0], TF), nowT, { deferToNextTick: true });
    expect(r.state.orders[r.orderId].status).toBe("CREATED");
    const s = stepCandle(r.state, candles[1], TF);
    const f = s.state.fills[0];
    expect(f.price).toBe("1.05");
    expect(f.liquidity).toBe("TAKER");
    expect(s.events.find((e) => e.type === "ORDER_ACCEPTED")?.t).toBe(candles[1].t);
  });

  it("stop-loss legs trigger along the revealed candle path", () => {
    let { state } = start();
    const r = placeOrder(state, { side: "BUY", type: "MARKET", qty: 1000, stopLoss: { pct: "10" } }, replaySnapshot(candles[0], TF), closeTime(candles[0], TF), { deferToNextTick: true });
    state = stepCandle(r.state, candles[1], TF).state; // entry @1.05, SL @0.945
    expect(state.position?.qty).toBe("1000");
    state = stepCandle(state, candles[2], TF).state; // low 0.90 → SL triggers
    expect(state.position).toBeNull();
    expect(state.trades[0].exitRoles).toEqual(["STOP_LOSS"]);
    expect(state.trades[0].avgExit).toBeCloseTo(0.9, 10); // gap-through fill at the observed path price
  });

  it("replay ledger is deterministic and replayable", () => {
    const run = () => {
      let { state, events } = start();
      const r = placeOrder(state, { side: "BUY", type: "LIMIT", qty: 500, limitPrice: 1.045 }, replaySnapshot(candles[0], TF), closeTime(candles[0], TF), { deferToNextTick: true });
      state = r.state;
      events = [...events, ...r.events];
      for (const c of candles.slice(1)) {
        const s = stepCandle(state, c, TF);
        state = s.state;
        events = [...events, ...s.events];
      }
      return { state, events };
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(replayEvents("replay-x", a.events))).toBe(JSON.stringify(a.state));
    expect(a.state.fills[0].price).toBe("1.045");
    expect(a.state.fills[0].liquidity).toBe("MAKER");
  });
});
