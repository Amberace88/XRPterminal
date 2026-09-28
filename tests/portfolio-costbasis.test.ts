import { describe, expect, it } from "vitest";
import { computeCostBasis, costBasisCoverage, validateLot } from "@/lib/portfolio/costBasis";
import { periodChangeAtCurrentHoldings, stressScenarios, worstWindowReturn, aggregateHoldings } from "@/lib/portfolio/holdings";
import type { Lot } from "@/lib/portfolio/types";
import type { Candle } from "@/lib/types/market";

let n = 0;
const lot = (side: "buy" | "sell", date: string, qty: string, price: string, fee = "0"): Lot => ({
  id: `l${++n}`,
  asset: "XRP",
  side,
  date,
  qty,
  price,
  fee,
  currency: "USD",
  createdAt: n,
});

const lots = [
  lot("buy", "2024-01-01", "1000", "0.50", "1"), // cost 501 → 0.501/XRP
  lot("buy", "2024-02-01", "1000", "1.00", "2"), // cost 1002 → 1.002/XRP
  lot("sell", "2024-03-01", "1500", "2.00", "3"), // proceeds 2997
];

describe("cost basis — FIFO", () => {
  it("realises oldest lots first, capitalises buy fees, nets sell fees", () => {
    const r = computeCostBasis(lots, "FIFO", 3);
    // cost removed: 1000×0.501 + 500×1.002 = 501 + 501 = 1002 → realised 2997 − 1002 = 1995
    expect(r.realizedPnl).toBe("1995");
    expect(r.remainingQty).toBe("500");
    expect(r.costBasis).toBe("501");
    expect(r.avgCost).toBe("1.002");
    expect(r.feesTotal).toBe("6");
    expect(r.marketValue).toBe("1500");
    expect(r.unrealizedPnl).toBe("999");
    expect(r.warnings).toEqual([]);
  });
  it("sorts by date regardless of input order", () => {
    expect(computeCostBasis([...lots].reverse(), "FIFO").realizedPnl).toBe("1995");
  });
});

describe("cost basis — average cost", () => {
  it("uses running average unit cost", () => {
    const r = computeCostBasis(lots, "AVERAGE", 3);
    // avg = 1503/2000 = 0.7515; cost removed 1500×0.7515 = 1127.25 → realised 2997 − 1127.25 = 1869.75
    expect(r.realizedPnl).toBe("1869.75");
    expect(r.costBasis).toBe("375.75");
    expect(r.avgCost).toBe("0.7515");
    expect(r.unrealizedPnl).toBe("1124.25");
  });
  it("is exact with decimals (no float drift)", () => {
    const r = computeCostBasis([lot("buy", "2024-01-01", "0.1", "0.2"), lot("buy", "2024-01-02", "0.2", "0.1")], "AVERAGE");
    expect(r.costBasis).toBe("0.04");
    expect(r.remainingQty).toBe("0.3");
  });
});

describe("oversold & coverage", () => {
  it("flags sells beyond recorded quantity and only realises the matched part", () => {
    const r = computeCostBasis([lot("buy", "2024-01-01", "100", "1"), lot("sell", "2024-01-02", "150", "2")], "FIFO");
    expect(r.unmatchedSellQty).toBe("50");
    // matched 100 of 150 → proceeds 200, cost 100 → realised 100
    expect(r.realizedPnl).toBe("100");
    expect(r.warnings[0]).toMatch(/exceeds recorded open quantity/);
    expect(costBasisCoverage(r, 0, true).message).toBe("Cost basis incomplete.");
  });
  it("reports 'Cost basis incomplete.' when lots do not cover holdings", () => {
    const r = computeCostBasis([lot("buy", "2024-01-01", "100", "1")], "FIFO");
    expect(costBasisCoverage(r, 1000, true)).toMatchObject({ complete: false, state: "incomplete", message: "Cost basis incomplete." });
    expect(costBasisCoverage(r, 100.5, true).complete).toBe(true);
    expect(costBasisCoverage(r, 10, true).state).toBe("exceeds-holdings");
    expect(costBasisCoverage(computeCostBasis([], "FIFO"), 50, false).message).toBe("Cost basis incomplete.");
  });
  it("validates lot input", () => {
    expect(validateLot({ date: "2024-01-01", qty: "0", price: "1", fee: "0" })).toMatch(/Quantity/);
    expect(validateLot({ date: "01/01/2024", qty: "1", price: "1", fee: "0" })).toMatch(/Date/);
    expect(validateLot({ date: "2024-01-01", qty: "1", price: "1", fee: "0" })).toBeNull();
  });
});

describe("holdings valuation & stress", () => {
  const day = 86_400_000;
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const closes = [1, 1.1, 0.8, 0.9, 1.2, 0.6, 0.66, 0.7, 1.0, 1.05];
  const candles: Candle[] = closes.map((c, i) => ({ t: t0 + i * day, o: c, h: c, l: c, c, v: 0 }));
  it("period change at current holdings", () => {
    const now = t0 + 9 * day + 3_600_000;
    const ch = periodChangeAtCurrentHoldings(candles, 1000, 1.05, 1, now)!;
    expect(ch.pastPrice).toBe(1.0);
    expect(ch.changeValue).toBeCloseTo(50, 9);
    expect(ch.changePct).toBeCloseTo(5, 9);
  });
  it("worst k-day windows are causal close-to-close", () => {
    expect(worstWindowReturn(candles, 1)!.returnPct).toBeCloseTo(-50, 9); // 1.2 → 0.6
    const w3 = worstWindowReturn(candles, 3)!;
    expect(w3.returnPct).toBeCloseTo((0.7 / 1.2 - 1) * 100, 9); // 1.2 (day 4) → 0.7 (day 7)
    const s = stressScenarios(candles, 10_000, [1]);
    expect(s[0].hypotheticalLoss).toBeCloseTo(-5000, 6);
    expect(worstWindowReturn(candles, 50)).toBeNull();
  });
  it("aggregates holdings and skips failed accounts", () => {
    const r = aggregateHoldings([
      { accountId: "1", label: "a", kind: "XRPL_WALLET", xrp: 10, tokens: [] },
      { accountId: "2", label: "b", kind: "XRPL_WALLET", xrp: 99, tokens: [], error: "down" },
    ]);
    expect(r).toMatchObject({ xrp: 10, accountsOk: 1, accountsFailed: 1 });
  });
});
