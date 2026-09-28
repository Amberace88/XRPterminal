import { describe, expect, it } from "vitest";
import {
  applySlippage, compound, dca, drawdownFromPeak, flatPath, historicalPath, impliedMarketCap, impliedPrice, linearPath, maxDrawdown,
  percentChange, pnl, portfolioScenario, positionSize, recoveryNeeded, riskReward, roundTripFees, scenario, slippage,
} from "@/lib/calculators";

describe("calculators", () => {
  it("P&L long/short with fees and break-even", () => {
    const l = pnl({ side: "long", entry: 0.5, exit: 0.6, qty: 1000, feePct: 0.1 })!;
    expect(l.gross).toBeCloseTo(100);
    expect(l.fees).toBeCloseTo(1.1);
    expect(l.net).toBeCloseTo(98.9);
    expect(l.returnPct).toBeCloseTo(19.78);
    expect(pnl({ side: "long", entry: 0.5, exit: l.breakEvenExit, qty: 1000, feePct: 0.1 })!.net).toBeCloseTo(0, 10);
    const s = pnl({ side: "short", entry: 1, exit: 0.8, qty: 10 })!;
    expect(s.net).toBeCloseTo(2);
    expect(pnl({ side: "long", entry: 0, exit: 1, qty: 1 })).toBeNull();
  });
  it("percentage change and recovery", () => {
    expect(percentChange(2, 3)).toBeCloseTo(50);
    expect(percentChange(0, 3)).toBeNull();
    expect(recoveryNeeded(50)).toBeCloseTo(100);
  });
  it("position size from risk budget (fees included)", () => {
    const p = positionSize({ accountSize: 10_000, riskPct: 1, entry: 0.5, stop: 0.45 })!;
    expect(p.riskAmount).toBe(100);
    expect(p.qty).toBeCloseTo(2000);
    expect(p.positionValue).toBeCloseTo(1000);
    expect(p.side).toBe("long");
    expect(p.stopDistancePct).toBeCloseTo(10);
    const withFees = positionSize({ accountSize: 10_000, riskPct: 1, entry: 0.5, stop: 0.45, feePct: 0.1 })!;
    expect(withFees.qty).toBeLessThan(p.qty);
    expect(positionSize({ accountSize: 10_000, riskPct: 1, entry: 0.5, stop: 0.5 })).toBeNull();
  });
  it("risk/reward ratio and break-even win rate", () => {
    const r = riskReward(1, 0.9, 1.3)!;
    expect(r.ratio).toBeCloseTo(3);
    expect(r.breakevenWinRate).toBeCloseTo(25);
    expect(riskReward(1, 1.1, 0.8)!.side).toBe("short");
    expect(riskReward(1, 0.9, 0.95)).toBeNull();
  });
  it("compound growth with contributions", () => {
    const c = compound(1000, 10, 2)!;
    expect(c.final).toBeCloseTo(1210);
    const d = compound(1000, 0, 3, 100)!;
    expect(d.final).toBeCloseTo(1300);
    expect(d.gain).toBeCloseTo(0);
    expect(c.series).toHaveLength(3);
  });
  it("drawdown and max drawdown", () => {
    const d = drawdownFromPeak(3.4, 1.7)!;
    expect(d.drawdownPct).toBeCloseTo(50);
    expect(d.recoveryPct).toBeCloseTo(100);
    const m = maxDrawdown([1, 2, 1.5, 3, 1.2, 2])!;
    expect(m.maxDrawdownPct).toBeCloseTo(60);
    expect(m.peakIndex).toBe(3);
    expect(m.troughIndex).toBe(4);
  });
  it("scenario and portfolio scenario", () => {
    const s = scenario(1000, 0.5, 1)!;
    expect(s.currentValue).toBe(500);
    expect(s.scenarioValue).toBe(1000);
    expect(s.pctChange).toBeCloseTo(100);
    const p = portfolioScenario([{ asset: "XRP", qty: 100, price: 1, scenarioPrice: 2 }, { asset: "USD", qty: 100, price: 1, scenarioPrice: 1 }]);
    expect(p.pctChange).toBeCloseTo(50);
    expect(p.rows[0].weight).toBeCloseTo(50);
  });
  it("DCA average cost is the harmonic mean for equal contributions", () => {
    const r = dca({ initial: 100, recurring: 100, prices: [1, 2, 4] })!;
    expect(r.contributions).toBe(300);
    expect(r.xrp).toBeCloseTo(100 + 50 + 25);
    expect(r.avgCost).toBeCloseTo(300 / 175);
    expect(r.value).toBeCloseTo(175 * 4);
    const withFee = dca({ initial: 100, recurring: 0, prices: [1], feePct: 1 })!;
    expect(withFee.xrp).toBeCloseTo(99);
    expect(withFee.fees).toBeCloseTo(1);
    expect(dca({ initial: 100, recurring: 100, prices: [1, -1] })).toBeNull();
  });
  it("price paths: flat, linear and historical (no lookahead)", () => {
    expect(flatPath(2, 3)).toEqual([2, 2, 2]);
    expect(linearPath(1, 2, 3)).toEqual([1, 1.5, 2]);
    const daily = Array.from({ length: 100 }, (_, i) => ({ t: Date.UTC(2026, 0, 1) + i * 86_400_000, c: i + 1 }));
    const h = historicalPath(daily, 7, 4);
    expect(h.prices).toEqual([79, 86, 93, 100]);
    expect(h.dates[3]).toBe(daily[99].t);
  });
  it("fees and slippage", () => {
    const f = roundTripFees(1000, 0.5, 0.6, 0.1)!;
    expect(f.entryFee).toBeCloseTo(0.5);
    expect(f.exitFee).toBeCloseTo(0.6);
    expect(f.breakEvenMovePct).toBeCloseTo(0.2002, 3);
    const s = slippage("buy", 1, 1.01, 100)!;
    expect(s.slippagePct).toBeCloseTo(1);
    expect(s.cost).toBeCloseTo(1);
    expect(slippage("sell", 1, 1.01, 100)!.slippagePct).toBeCloseTo(-1); // favourable
    expect(applySlippage("buy", 1, 50)).toBeCloseTo(1.005);
  });
  it("implied market cap / price", () => {
    expect(impliedMarketCap(2, 60e9)).toBe(120e9);
    expect(impliedPrice(120e9, 60e9)).toBe(2);
    expect(impliedMarketCap(2, 0)).toBeNull();
  });
});
