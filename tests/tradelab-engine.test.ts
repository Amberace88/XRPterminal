import { describe, expect, it } from "vitest";
import {
  applyEvent,
  cancelOrder,
  closePosition,
  createAccount,
  emptyState,
  estimateOrder,
  openOrders,
  placeOrder,
  processTick,
  replayEvents,
  resetAccount,
  stateAtVersion,
  summarize,
  updateSettings,
} from "@/lib/tradelab/engine";
import { DEFAULT_SETTINGS, type AccountSettings, type AccountState, type LedgerEvent, type MarketSnapshot } from "@/lib/tradelab/types";

// Synthetic fixtures only (tests are the only place fixtures are allowed).
const T0 = Date.UTC(2025, 0, 6, 12, 0, 0);
const snap = (price: number, dt = 0, spread = 0): MarketSnapshot => ({
  price,
  bid: spread ? price - spread : undefined,
  ask: spread ? price + spread : undefined,
  t: T0 + dt,
  source: "test",
});

function account(settings: Partial<AccountSettings> = {}, capital = 100_000) {
  const s: AccountSettings = { ...DEFAULT_SETTINGS, ...settings };
  const r = createAccount({ accountId: "acc1", name: "Test", startingCapital: capital, settings: s, t: T0 });
  return { state: r.state, events: [...r.events] };
}

/** Small driver that keeps the ledger & asserts replay equivalence after each step. */
class Sim {
  state: AccountState;
  events: LedgerEvent[];
  constructor(settings: Partial<AccountSettings> = {}, capital = 100_000) {
    const a = account(settings, capital);
    this.state = a.state;
    this.events = a.events;
  }
  apply<R extends { events: LedgerEvent[]; state: AccountState }>(r: R): R {
    this.events.push(...r.events);
    this.state = r.state;
    return r;
  }
  place(input: Parameters<typeof placeOrder>[1], s: MarketSnapshot | null, t: number, opts?: Parameters<typeof placeOrder>[4]) {
    return this.apply(placeOrder(this.state, input, s, t, opts));
  }
  tick(s: MarketSnapshot) {
    return this.apply(processTick(this.state, s));
  }
}

const noSlip: Partial<AccountSettings> = { slippage: { ...DEFAULT_SETTINGS.slippage, fixedBps: 0 } };

describe("account", () => {
  it("creates an account with default $100k virtual capital via ledger events", () => {
    const { state, events } = account();
    expect(events.map((e) => e.type)).toEqual(["ACCOUNT_CREATED", "VIRTUAL_CAPITAL_ASSIGNED"]);
    expect(state.cash).toBe("100000");
    expect(state.initialized).toBe(true);
  });
  it("rejects non-standard starting capital", () => {
    expect(() => createAccount({ accountId: "x", startingCapital: 12345, t: T0 })).toThrow();
  });
});

describe("market orders", () => {
  it("fills a market buy at ask + slippage with taker fee", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 1000 }, snap(2, 0, 0.001), T0);
    expect(r.rejection).toBeNull();
    const o = sim.state.orders[r.orderId];
    expect(o.status).toBe("FILLED");
    const f = sim.state.fills[0];
    // ask 2.001 * (1 + 5bps) = 2.0020005
    expect(f.price).toBe("2.0020005");
    expect(f.refPrice).toBe("2.001");
    expect(f.slippageBps).toBe(5);
    expect(f.gross).toBe("2002.0005");
    expect(f.feeRate).toBe(0.1);
    expect(f.feeAmount).toBe("2.0020005");
    expect(f.liquidity).toBe("TAKER");
    expect(f.feeSource).toMatch(/taker/);
    // cash = 100000 - 2002.0005 - 2.0020005
    expect(sim.state.cash).toBe("97995.9974995");
    expect(sim.state.position?.qty).toBe("1000");
    expect(sim.events.map((e) => e.type)).toEqual([
      "ACCOUNT_CREATED",
      "VIRTUAL_CAPITAL_ASSIGNED",
      "ORDER_CREATED",
      "ORDER_ACCEPTED",
      "ORDER_FILLED",
      "FEE_CHARGED",
      "POSITION_OPENED",
    ]);
  });

  it("market sell fills at bid − slippage and realizes long P&L", () => {
    const sim = new Sim(noSlip);
    sim.place({ side: "BUY", type: "MARKET", qty: 1000 }, snap(1), T0);
    const r = sim.place({ side: "SELL", type: "MARKET", qty: 1000 }, snap(1.2, 60_000), T0 + 60_000);
    expect(r.rejection).toBeNull();
    expect(sim.state.position).toBeNull();
    expect(sim.state.trades).toHaveLength(1);
    const tr = sim.state.trades[0];
    expect(tr.grossPnl).toBeCloseTo(200, 8); // (1.2 − 1) × 1000
    expect(tr.fees).toBeCloseTo(1 + 1.2, 8); // 0.1% of 1000 + 0.1% of 1200
    expect(tr.netPnl).toBeCloseTo(197.8, 8);
    expect(Number(sim.state.cash)).toBeCloseTo(100_000 + 197.8, 8);
    expect(tr.holdingMs).toBe(60_000);
  });

  it("applies size-adjusted slippage deterministically", () => {
    const sim = new Sim({ slippage: { fixedBps: 5, sizeBpsPer100k: 10, volatilityFactor: 0, maxBps: 200 } });
    sim.place({ side: "BUY", type: "MARKET", qty: 25_000 }, snap(2), T0); // notional 50k → +5 bps
    expect(sim.state.fills[0].slippageBps).toBe(10);
    expect(sim.state.fills[0].price).toBe("2.002");
    expect(Number(sim.state.fills[0].slippageCost)).toBeCloseTo(0.002 * 25_000, 8);
  });

  it("rejects market orders without a quote or with a stale quote", () => {
    const sim = new Sim();
    const a = sim.place({ side: "BUY", type: "MARKET", qty: 10 }, null, T0);
    expect(a.rejection?.code).toBe("NO_MARKET_DATA");
    const b = sim.place({ side: "BUY", type: "MARKET", qty: 10 }, snap(1), T0 + 10 * 60_000);
    expect(b.rejection?.code).toBe("STALE_MARKET_DATA");
    expect(sim.state.orders[b.orderId].status).toBe("REJECTED");
  });
});

describe("validation", () => {
  it("rejects insufficient virtual cash (incl. fee)", () => {
    const sim = new Sim(noSlip, 10_000);
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 10_000 }, snap(1), T0); // needs 10,010 incl. fee
    expect(r.rejection?.code).toBe("INSUFFICIENT_CASH");
    expect(sim.events.at(-1)?.type).toBe("ORDER_REJECTED");
    expect(sim.state.cash).toBe("10000");
  });
  it("rejects invalid quantity and prices", () => {
    const sim = new Sim();
    expect(sim.place({ side: "BUY", type: "MARKET", qty: 0 }, snap(1), T0).rejection?.code).toBe("INVALID_QTY");
    expect(sim.place({ side: "BUY", type: "MARKET", qty: -5 }, snap(1), T0).rejection?.code).toBe("INVALID_QTY");
    expect(sim.place({ side: "BUY", type: "LIMIT", qty: 5, limitPrice: -1 }, snap(1), T0).rejection?.code).toBe("INVALID_PRICE");
    expect(sim.place({ side: "BUY", type: "LIMIT", qty: 5 }, snap(1), T0).rejection?.code).toBe("INVALID_LIMIT");
  });
  it("enforces stop/limit relations", () => {
    const sim = new Sim();
    expect(sim.place({ side: "BUY", type: "STOP", qty: 5, stopPrice: 0.9 }, snap(1), T0).rejection?.code).toBe("INVALID_STOP");
    expect(sim.place({ side: "BUY", type: "STOP_LIMIT", qty: 5, stopPrice: 1.1, limitPrice: 1.05 }, snap(1), T0).rejection?.code).toBe("INVALID_LIMIT");
    expect(sim.place({ side: "BUY", type: "MARKET", qty: 5, stopLoss: { price: "1.2" } }, snap(1), T0).rejection?.code).toBe("INVALID_BRACKET");
  });
  it("is long-only: cannot sell more than held", () => {
    const sim = new Sim();
    expect(sim.place({ side: "SELL", type: "MARKET", qty: 5 }, snap(1), T0).rejection?.code).toBe("INSUFFICIENT_POSITION");
    sim.place({ side: "BUY", type: "MARKET", qty: 5 }, snap(1), T0);
    expect(sim.place({ side: "SELL", type: "MARKET", qty: 6 }, snap(1), T0).rejection?.code).toBe("INSUFFICIENT_POSITION");
  });
  it("rejects orders exceeding max position %", () => {
    const sim = new Sim({ ...noSlip, risk: { ...DEFAULT_SETTINGS.risk, maxPositionPct: 25 } });
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 30_000 }, snap(1), T0); // 30% of equity
    expect(r.rejection?.code).toBe("MAX_POSITION");
    expect(sim.place({ side: "BUY", type: "MARKET", qty: 20_000 }, snap(1), T0).rejection).toBeNull();
  });
  it("rejects orders exceeding max risk % to the stop", () => {
    const sim = new Sim({ ...noSlip, risk: { ...DEFAULT_SETTINGS.risk, maxRiskPct: 1 } });
    // risk = (1 − 0.9) × 20,000 = 2,000 = 2% of equity
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 20_000, stopLoss: { price: "0.9" } }, snap(1), T0);
    expect(r.rejection?.code).toBe("MAX_RISK");
  });
  it("blocks new entries after the daily loss limit is breached", () => {
    const sim = new Sim({ ...noSlip, risk: { ...DEFAULT_SETTINGS.risk, maxDailyLossPct: 2 } });
    sim.place({ side: "BUY", type: "MARKET", qty: 50_000 }, snap(1), T0);
    sim.place({ side: "BUY", type: "LIMIT", qty: 1000, limitPrice: 0.5 }, snap(1), T0);
    sim.tick(snap(0.9, 60_000)); // −5,000 on 100k ≈ −5%
    expect(sim.events.some((e) => e.type === "RISK_LIMIT_BREACHED")).toBe(true);
    expect(openOrders(sim.state).filter((o) => o.side === "BUY")).toHaveLength(0);
    expect(sim.place({ side: "BUY", type: "MARKET", qty: 10 }, snap(0.9, 61_000), T0 + 61_000).rejection?.code).toBe("DAILY_LOSS_LIMIT");
  });
});

describe("limit, stop and stop-limit", () => {
  it("resting limit buy fills at the limit as maker once ask ≤ limit", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "LIMIT", qty: 1000, limitPrice: 0.95 }, snap(1, 0, 0.001), T0);
    expect(sim.state.orders[r.orderId].status).toBe("OPEN");
    sim.tick(snap(0.96, 1000, 0.001));
    expect(sim.state.orders[r.orderId].status).toBe("OPEN");
    sim.tick(snap(0.94, 2000, 0.001)); // ask 0.941 ≤ 0.95
    const o = sim.state.orders[r.orderId];
    expect(o.status).toBe("FILLED");
    expect(o.avgFillPrice).toBe("0.95");
    const f = sim.state.fills[0];
    expect(f.liquidity).toBe("MAKER");
    expect(f.feeRate).toBe(0.05);
    expect(f.feeAmount).toBe("0.475");
    expect(f.slippageBps).toBe(0);
  });

  it("marketable limit fills immediately as taker, capped at limit", () => {
    const sim = new Sim();
    sim.place({ side: "BUY", type: "LIMIT", qty: 100, limitPrice: 1.0002 }, snap(1), T0);
    const f = sim.state.fills[0];
    expect(f.liquidity).toBe("TAKER");
    expect(f.price).toBe("1.0002"); // 1 × 1.0005 capped to limit 1.0002
  });

  it("stop buy triggers when ask ≥ stop and fills at market (through gaps)", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "STOP", qty: 100, stopPrice: 1.1 }, snap(1), T0);
    sim.tick(snap(1.05, 1000));
    expect(sim.state.orders[r.orderId].status).toBe("OPEN");
    sim.tick(snap(1.2, 2000)); // gap above stop
    const o = sim.state.orders[r.orderId];
    expect(o.status).toBe("FILLED");
    expect(o.triggeredAt).toBe(T0 + 2000);
    expect(o.triggerObservedPrice).toBe("1.2");
    expect(sim.state.fills[0].price).toBe("1.2006"); // 1.2 × 1.0005
    expect(sim.events.map((e) => e.type)).toContain("ORDER_TRIGGERED");
  });

  it("stop-limit activates a limit that only fills within the limit", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "STOP_LIMIT", qty: 100, stopPrice: 1.1, limitPrice: 1.12 }, snap(1), T0);
    sim.tick(snap(1.15, 1000)); // triggers, but ask 1.15 > limit 1.12 → rests
    let o = sim.state.orders[r.orderId];
    expect(o.status).toBe("TRIGGERED");
    expect(sim.state.fills).toHaveLength(0);
    sim.tick(snap(1.11, 2000));
    o = sim.state.orders[r.orderId];
    expect(o.status).toBe("FILLED");
    expect(o.avgFillPrice).toBe("1.12");
    expect(sim.state.fills[0].liquidity).toBe("MAKER");
  });
});

describe("stop-loss / take-profit (OCO)", () => {
  it("creates SL/TP legs on fill; SL trigger closes position and cancels TP", () => {
    const sim = new Sim(noSlip);
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 1000, stopLoss: { pct: "5" }, takeProfit: { pct: "10" } }, snap(1), T0);
    const entry = sim.state.orders[r.orderId];
    expect(entry.childIds).toHaveLength(2);
    const [sl, tp] = entry.childIds.map((id) => sim.state.orders[id]);
    expect(sl.type).toBe("STOP");
    expect(sl.stopPrice).toBe("0.95");
    expect(tp.type).toBe("LIMIT");
    expect(tp.limitPrice).toBe("1.1");
    expect(sl.ocoGroup).toBe(tp.ocoGroup);
    sim.tick(snap(0.97, 1000));
    expect(sim.state.position?.qty).toBe("1000");
    sim.tick(snap(0.94, 2000));
    expect(sim.state.position).toBeNull();
    expect(sim.state.orders[sl.id].status).toBe("FILLED");
    expect(sim.state.orders[tp.id].status).toBe("CANCELLED");
    const tr = sim.state.trades[0];
    expect(tr.exitRoles).toEqual(["STOP_LOSS"]);
    expect(tr.initialStop).toBe(0.95);
  });

  it("take-profit fills as maker at the target and cancels the stop", () => {
    const sim = new Sim(noSlip);
    const r = sim.place({ side: "BUY", type: "MARKET", qty: 1000, stopLoss: { price: "0.9" }, takeProfit: { price: "1.2" } }, snap(1), T0);
    const [sl, tp] = sim.state.orders[r.orderId].childIds;
    sim.tick(snap(1.25, 1000));
    expect(sim.state.orders[tp].status).toBe("FILLED");
    expect(sim.state.orders[tp].avgFillPrice).toBe("1.2");
    expect(sim.state.orders[sl].status).toBe("CANCELLED");
    const tr = sim.state.trades[0];
    expect(tr.grossPnl).toBeCloseTo(200, 8);
    // R = net / ((1 − 0.9) × 1000) = (200 − 1 − 0.6) / 100
    expect(tr.rMultiple).toBeCloseTo((200 - 1 - 0.6) / 100, 8);
  });
});

describe("partial fills, cancellation and expiry", () => {
  it("fills deterministically in chunks with maxFillQtyPerTick", () => {
    const settings = { ...noSlip, risk: { ...DEFAULT_SETTINGS.risk, maxFillQtyPerTick: 400 } };
    const sim = new Sim(settings);
    const r = sim.place({ side: "BUY", type: "LIMIT", qty: 1000, limitPrice: 0.9 }, snap(1), T0);
    sim.tick(snap(0.89, 1000));
    expect(sim.state.orders[r.orderId].status).toBe("PARTIALLY_FILLED");
    expect(sim.state.orders[r.orderId].filledQty).toBe("400");
    sim.tick(snap(0.89, 2000));
    expect(sim.state.orders[r.orderId].filledQty).toBe("800");
    sim.tick(snap(0.89, 3000));
    expect(sim.state.orders[r.orderId].status).toBe("FILLED");
    expect(sim.state.fills.map((f) => f.qty)).toEqual(["400", "400", "200"]);
    expect(sim.state.position?.qty).toBe("1000");
    expect(sim.state.position?.avgEntry).toBe("0.9");
  });

  it("cancels an open order and releases reserved cash", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "LIMIT", qty: 10_000, limitPrice: 0.5 }, snap(1), T0);
    expect(summarize(sim.state, 1).reservedCash).toBeGreaterThan(0);
    sim.apply(cancelOrder(sim.state, r.orderId, T0 + 5));
    expect(sim.state.orders[r.orderId].status).toBe("CANCELLED");
    expect(summarize(sim.state, 1).reservedCash).toBe(0);
    sim.tick(snap(0.4, 10));
    expect(sim.state.fills).toHaveLength(0);
  });

  it("expires DAY orders at the end of the UTC day", () => {
    const sim = new Sim();
    const r = sim.place({ side: "BUY", type: "LIMIT", qty: 10, limitPrice: 0.5, tif: "DAY" }, snap(1), T0);
    sim.tick(snap(0.9, 6 * 3600_000)); // same UTC day (18:00)
    expect(sim.state.orders[r.orderId].status).toBe("OPEN");
    sim.tick(snap(0.4, 13 * 3600_000)); // next day 01:00 — expires before it can fill
    expect(sim.state.orders[r.orderId].status).toBe("EXPIRED");
    expect(sim.state.fills).toHaveLength(0);
  });
});

describe("equity, drawdown & P&L", () => {
  it("computes equity, unrealized P&L and max drawdown from the equity curve", () => {
    const sim = new Sim({ ...noSlip, fees: { ...DEFAULT_SETTINGS.fees, takerPct: 0, makerPct: 0 } });
    sim.place({ side: "BUY", type: "MARKET", qty: 50_000 }, snap(1), T0); // equity 100k
    sim.tick(snap(1.2, 3600_000)); // equity 110k (peak)
    sim.tick(snap(0.9, 7200_000)); // equity 95k → dd = 15/110 = 13.636%
    sim.tick(snap(1.0, 10_800_000)); // 100k
    const sum = summarize(sim.state, 1.0);
    expect(sum.equity).toBeCloseTo(100_000, 6);
    expect(sum.unrealizedPnl).toBeCloseTo(0, 6);
    expect(sum.peakEquity).toBeCloseTo(110_000, 6);
    expect(sim.state.maxDrawdownPct).toBeCloseTo((15_000 / 110_000) * 100, 6);
    expect(sum.drawdownPct).toBeCloseTo((10_000 / 110_000) * 100, 6);
    const s2 = summarize(sim.state, 1.1);
    expect(s2.unrealizedPnl).toBeCloseTo(5_000, 6);
  });

  it("estimates risk preview: risk amount, % , R:R, fee and net", () => {
    const { state } = account(noSlip);
    const est = estimateOrder(state, { side: "BUY", type: "MARKET", qty: 1000, stopLoss: { price: "0.95" }, takeProfit: { price: "1.1" } }, snap(1), T0);
    expect(est.estFillPrice).toBe(1);
    expect(est.riskAmount).toBeCloseTo(50, 8);
    expect(est.riskPct).toBeCloseTo(0.05, 8);
    expect(est.rewardRisk).toBeCloseTo(2, 8);
    expect(est.fee).toBeCloseTo(1, 8);
    expect(est.net).toBeCloseTo(1001, 8);
    expect(est.stopDistancePct).toBeCloseTo(5, 8);
    expect(est.rejection).toBeNull();
  });
});

describe("ledger integrity", () => {
  function scenario() {
    const sim = new Sim({ ...DEFAULT_SETTINGS, risk: { ...DEFAULT_SETTINGS.risk, maxFillQtyPerTick: 700 } });
    sim.place({ side: "BUY", type: "LIMIT", qty: 1000, limitPrice: 0.98, stopLoss: { pct: "3" }, takeProfit: { pct: "6" } }, snap(1, 0, 0.0005), T0);
    sim.tick(snap(0.97, 1000, 0.0005));
    sim.tick(snap(0.975, 2000, 0.0005));
    sim.tick(snap(1.02, 3000, 0.0005));
    sim.tick(snap(1.05, 4000, 0.0005));
    sim.place({ side: "BUY", type: "STOP", qty: 300, stopPrice: 1.07 }, snap(1.05, 5000), T0 + 5000);
    sim.apply(updateSettings(sim.state, { ...sim.state.settings, slippage: { ...sim.state.settings.slippage, fixedBps: 8 } }, T0 + 5500));
    sim.tick(snap(1.08, 6000, 0.0005));
    const c = closePosition(sim.state, snap(1.09, 7000, 0.0005), T0 + 7000);
    if (c) sim.apply(c);
    return sim;
  }

  it("event replay reproduces identical state (determinism)", () => {
    const a = scenario();
    const b = scenario();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    const replayed = replayEvents("acc1", a.events);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(a.state));
    const stepwise = a.events.reduce(applyEvent, emptyState("acc1"));
    expect(JSON.stringify(stepwise)).toBe(JSON.stringify(a.state));
  });

  it("every cash change is backed by an event (no hidden balance changes)", () => {
    const a = scenario();
    let cash = 0;
    for (const e of a.events) {
      if (e.type === "VIRTUAL_CAPITAL_ASSIGNED") cash += Number(e.payload.amount);
      if (e.type === "ORDER_FILLED") cash += Number(e.payload.cashDelta);
      if (e.type === "FEE_CHARGED") cash -= Number(e.payload.feeAmount);
    }
    expect(cash).toBeCloseTo(Number(a.state.cash), 6);
    expect(a.state.position).toBeNull();
    expect(Number(a.state.cash)).toBeCloseTo(100_000 + a.state.trades.reduce((x, t) => x + t.netPnl, 0), 6);
  });

  it("ignores out-of-order (older) snapshots", () => {
    const sim = new Sim();
    sim.place({ side: "BUY", type: "LIMIT", qty: 10, limitPrice: 0.9 }, snap(1), T0);
    sim.tick(snap(0.95, 5000));
    const r = processTick(sim.state, snap(0.5, 1000));
    expect(r.events).toHaveLength(0);
  });

  it("reset creates a new version and keeps the previous ledger", () => {
    const sim = new Sim(noSlip);
    sim.place({ side: "BUY", type: "MARKET", qty: 1000 }, snap(1), T0);
    sim.place({ side: "SELL", type: "MARKET", qty: 1000 }, snap(1.1, 1000), T0 + 1000);
    sim.place({ side: "BUY", type: "LIMIT", qty: 10, limitPrice: 0.5 }, snap(1.1, 1000), T0 + 1000);
    const before = sim.events.length;
    sim.apply(resetAccount(sim.state, 50_000, T0 + 2000));
    expect(sim.state.version).toBe(2);
    expect(sim.state.cash).toBe("50000");
    expect(sim.state.trades).toHaveLength(0);
    expect(openOrders(sim.state)).toHaveLength(0);
    expect(sim.events.length).toBeGreaterThan(before);
    expect(sim.events.slice(0, before).every((e) => e.version === 1)).toBe(true);
    const v1 = stateAtVersion("acc1", sim.events, 1);
    expect(v1.trades).toHaveLength(1);
    expect(v1.version).toBe(1);
    // replay of the full ledger lands on version 2
    expect(JSON.stringify(replayEvents("acc1", sim.events))).toBe(JSON.stringify(sim.state));
    // ids stay unique across versions
    sim.place({ side: "BUY", type: "MARKET", qty: 10 }, snap(1, 3000), T0 + 3000);
    const ids = sim.events.filter((e) => e.type === "ORDER_CREATED").map((e) => (e.type === "ORDER_CREATED" ? e.payload.order.id : ""));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
