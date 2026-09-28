import { describe, expect, it } from "vitest";
import { computeChallenge } from "@/lib/tradelab/challenges";
import { filterJournal, ruleBasedCoach, type JournalEntry } from "@/lib/tradelab/journal";
import { buyAndHold, drawdownDetail, scorecard, tradeStats } from "@/lib/tradelab/stats";
import type { ClosedTrade, EquityPoint } from "@/lib/tradelab/types";

const H = 3_600_000;
function trade(id: string, net: number, opts: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id,
    version: 1,
    openedAt: 0,
    closedAt: H,
    holdingMs: H,
    qty: 1000,
    avgEntry: 1,
    avgExit: 1 + net / 1000,
    grossPnl: net,
    fees: 0,
    netPnl: net,
    returnPct: net / 10,
    slippageCost: 0,
    initialStop: 0.95,
    initialTarget: null,
    initialRisk: 50,
    rMultiple: net / 50,
    plannedEntry: 1,
    plannedRisk: 50,
    exitRoles: ["EXIT"],
    entryOrderId: "o1",
    highWhileOpen: 1.1,
    lowWhileOpen: 0.9,
    ...opts,
  };
}

describe("trade statistics", () => {
  const trades = [trade("p1", 100), trade("p2", -50), trade("p3", 200), trade("p4", -50), trade("p5", 0)];
  const s = tradeStats(trades, 10_000);
  it("computes win/loss, averages, profit factor and extremes", () => {
    expect(s.totalTrades).toBe(5);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.breakeven).toBe(1);
    expect(s.winRate).toBeCloseTo(40);
    expect(s.avgWin).toBeCloseTo(150);
    expect(s.avgLoss).toBeCloseTo(-50);
    expect(s.profitFactor).toBeCloseTo(3);
    expect(s.largestWin).toBe(200);
    expect(s.largestLoss).toBe(-50);
    expect(s.netPnl).toBe(200);
    expect(s.returnPct).toBeCloseTo(2);
    expect(s.avgHoldingMs).toBe(H);
  });
  it("computes R-multiples only where a stop existed", () => {
    const t = [trade("a", 100), trade("b", -40, { initialStop: null, initialRisk: null, rMultiple: null })];
    const st = tradeStats(t, 10_000);
    expect(st.tradesWithR).toBe(1);
    expect(st.avgR).toBeCloseTo(2);
  });
  it("withholds risk-adjusted metric below the minimum sample", () => {
    expect(s.perTradeSharpe).toBeNull();
    const many = Array.from({ length: 25 }, (_, i) => trade(`t${i}`, i % 3 ? 30 : -20));
    expect(tradeStats(many, 10_000).perTradeSharpe).not.toBeNull();
  });
});

describe("drawdown", () => {
  const pts = [100, 110, 99, 88, 95, 112, 105].map((equity, i) => ({ t: i * H, equity }));
  it("finds peak, trough, recovery and duration", () => {
    const d = drawdownDetail(pts);
    expect(d.maxDrawdownPct).toBeCloseTo(20); // 110 → 88
    expect(d.maxDrawdownAbs).toBeCloseTo(22);
    expect(d.peakT).toBe(1 * H);
    expect(d.troughT).toBe(3 * H);
    expect(d.recoveryT).toBe(5 * H);
    expect(d.durationMs).toBe(4 * H);
    expect(d.currentDrawdownPct).toBeCloseTo((7 / 112) * 100);
  });
  it("reports unrecovered drawdowns", () => {
    const d = drawdownDetail([100, 120, 90].map((equity, i) => ({ t: i, equity })));
    expect(d.recoveryT).toBeNull();
    expect(d.maxDrawdownPct).toBeCloseTo(25);
  });
});

describe("buy-and-hold benchmark", () => {
  it("uses the same starting capital and period, paying one taker fee", () => {
    const curve: EquityPoint[] = [
      { t: 0, price: 0.5, cash: 100_000, positionValue: 0, equity: 100_000 },
      { t: 1, price: 0.6, cash: 100_000, positionValue: 0, equity: 100_000 },
      { t: 2, price: 1.0, cash: 0, positionValue: 101_000, equity: 101_000 },
    ];
    const b = buyAndHold(curve, 100_000, 0.1);
    expect(b.entryPrice).toBe(0.5);
    expect(b.points[2].benchmark).toBeCloseTo((99_900 / 0.5) * 1.0);
    expect(b.benchmarkReturnPct).toBeCloseTo(99.8);
    expect(b.strategyReturnPct).toBeCloseTo(1);
    const sc = scorecard(tradeStats([], 100_000, 101_000), drawdownDetail(curve), b, []);
    expect(sc.differencePct).toBeCloseTo(1 - 99.8);
  });
});

describe("journal & rule-based coach", () => {
  const trades = [trade("p1", 100), trade("p2", -50), trade("p3", -60, { initialStop: null, initialRisk: null, rMultiple: null }), trade("p4", 80)];
  const j = (tradeId: string, tags: string[], setup = "Breakout", lesson = ""): JournalEntry => ({
    id: `j-${tradeId}`,
    accountId: "a",
    tradeId,
    version: 1,
    reasonForEntry: "test",
    setup,
    regime: "RANGE",
    plannedRisk: 50,
    plannedStop: 0.95,
    plannedTarget: 1.1,
    emotion: "Calm",
    confidence: 3,
    exitReason: "",
    lesson,
    tags,
    createdAt: 0,
    updatedAt: 0,
  });
  const entries = [j("p1", ["GOOD_SETUP", "FOLLOWED_PLAN"]), j("p2", ["FOMO"], "Chase"), j("p3", ["FOMO", "NO_STOP"], "Chase", "Always set a stop")];
  it("computes tag frequencies, loss rate after FOMO and no-stop share", () => {
    const c = ruleBasedCoach(trades, entries);
    expect(c.journaled).toBe(3);
    expect(c.coveragePct).toBe(75);
    expect(c.lossRateAfterFomo).toBe(100);
    expect(c.noStopPct).toBe(25);
    expect(c.tagStats.find((g) => g.key === "FOMO")?.count).toBe(2);
    expect(c.setupStats.find((g) => g.key === "Chase")?.netPnl).toBe(-110);
    expect(c.findings.length).toBeGreaterThan(0);
    expect(c.findings.every((f) => !/buy now|sell now/i.test(f.text))).toBe(true);
  });
  it("filters by tag, result, setup, lesson and text", () => {
    const rows = trades.map((t) => ({ trade: t, entry: entries.find((e) => e.tradeId === t.id) ?? null }));
    expect(filterJournal(rows, { tag: "FOMO" }).map((r) => r.trade.id)).toEqual(["p2", "p3"]);
    expect(filterJournal(rows, { result: "win" }).map((r) => r.trade.id)).toEqual(["p1", "p4"]);
    expect(filterJournal(rows, { setup: "chase", onlyWithLesson: true }).map((r) => r.trade.id)).toEqual(["p3"]);
    expect(filterJournal(rows, { q: "always set" }).map((r) => r.trade.id)).toEqual(["p3"]);
    expect(filterJournal(rows, { onlyMistakes: true }).map((r) => r.trade.id)).toEqual(["p2", "p3"]);
  });
});

describe("challenges", () => {
  const base = { equityCurve: [], journal: [], replaySessions: [], startingCapital: 10_000, now: 40 * 86_400_000 };
  it("risk management fails on a trade without stop and completes with 10 compliant trades", () => {
    const ok = Array.from({ length: 10 }, (_, i) => trade(`p${i}`, 10, { closedAt: 1000 + i, initialRisk: 90 }));
    expect(computeChallenge("RISK_MANAGEMENT", { id: "RISK_MANAGEMENT", startedAt: 0, accountId: "a" }, { ...base, trades: ok }).status).toBe("COMPLETED");
    const bad = [...ok.slice(0, 3), trade("x", 5, { closedAt: 5000, initialStop: null, initialRisk: null })];
    expect(computeChallenge("RISK_MANAGEMENT", { id: "RISK_MANAGEMENT", startedAt: 0, accountId: "a" }, { ...base, trades: bad }).status).toBe("FAILED");
  });
  it("counts only data after the challenge start", () => {
    const t = Array.from({ length: 10 }, (_, i) => trade(`p${i}`, 10, { closedAt: 100 + i }));
    const p = computeChallenge("RISK_MANAGEMENT", { id: "RISK_MANAGEMENT", startedAt: 105, accountId: "a" }, { ...base, trades: t });
    expect(p.metrics[0].value).toBe("5");
    expect(p.status).toBe("IN_PROGRESS");
  });
});

describe("position sizing calculator", () => {
  it("sizes so a stop-out loses the chosen % of the account", async () => {
    const { positionSize } = await import("@/lib/tradelab/risk");
    const r = positionSize(100_000, 1, 2, 1.9, 2.3)!;
    expect(r.qty).toBe(10_000);
    expect(r.riskAmount).toBeCloseTo(1000);
    expect(r.potentialProfit).toBeCloseTo(3000);
    expect(r.rewardRisk).toBeCloseTo(3);
    expect(positionSize(100_000, 1, 2, 2.1, null)).toBeNull();
  });
});
