import { describe, expect, it } from "vitest";
import { applyBookUpdate, bookFromSnapshot, bookMetrics, cumulative } from "@/lib/analytics/orderbook";
import { computeMarketHealth } from "@/lib/analytics/health";
import { candlesFromCloses, randomWalk } from "./history-fixtures";

describe("order book (Kraken WS v2 shape)", () => {
  const snap = {
    symbol: "XRP/USD",
    bids: [
      { price: 0.5, qty: 100 },
      { price: 0.499, qty: 200 },
      { price: 0.498, qty: 300 },
    ],
    asks: [
      { price: 0.502, qty: 150 },
      { price: 0.501, qty: 50 },
    ],
  };

  it("builds a sorted, depth-limited snapshot", () => {
    const b = bookFromSnapshot(snap, 2, 1);
    expect(b.bids.map((l) => l.price)).toEqual([0.5, 0.499]);
    expect(b.asks.map((l) => l.price)).toEqual([0.501, 0.502]);
  });

  it("applies updates, removes zero-qty levels and truncates", () => {
    let b = bookFromSnapshot(snap, 3, 1);
    b = applyBookUpdate(b, { bids: [{ price: 0.5, qty: 0 }, { price: 0.4995, qty: 10 }], asks: [{ price: 0.5005, qty: 5 }] }, 2);
    expect(b.bids.map((l) => l.price)).toEqual([0.4995, 0.499, 0.498]);
    expect(b.asks[0]).toEqual({ price: 0.5005, qty: 5 });
    expect(b.asks).toHaveLength(3);
    expect(b.updatedAt).toBe(2);
  });

  it("computes spread, depth and imbalance", () => {
    const m = bookMetrics(bookFromSnapshot(snap, 10));
    expect(m.bestBid).toBe(0.5);
    expect(m.bestAsk).toBe(0.501);
    expect(m.spread).toBeCloseTo(0.001, 10);
    expect(m.spreadPct).toBeCloseTo((0.001 / 0.5005) * 100, 8);
    expect(m.imbalance).toBeCloseTo((600 - 200) / 800, 8);
    expect(m.depth1PctBid).toBeCloseTo(0.5 * 100 + 0.499 * 200 + 0.498 * 300, 8);
    expect(cumulative(bookFromSnapshot(snap, 10).bids).map((l) => l.cum)).toEqual([100, 300, 600]);
    expect(bookMetrics(null).spread).toBeNull();
  });
});

describe("market health", () => {
  const xrp = candlesFromCloses(randomWalk(800, 31, 0.035));
  const btc = candlesFromCloses(randomWalk(800, 32, 0.025));

  it("returns every spec component with percentile/trend/timestamp where computable", () => {
    const h = computeMarketHealth(xrp, btc, { spreadPct: 0.02, depth1Pct: 50000, quote: "USD", asOf: 1, venue: "Kraken" });
    const ids = h.components.map((c) => c.id);
    expect(ids).toEqual(["volatility", "volume", "momentum", "trend", "correlation", "regime", "liquidity", "xrpl", "flows", "concentration"]);
    for (const id of ["volatility", "volume", "momentum", "trend", "correlation"] as const) {
      const c = h.components.find((x) => x.id === id)!;
      expect(c.available).toBe(true);
      expect(c.percentile).not.toBeNull();
      expect(c.percentile!).toBeGreaterThanOrEqual(0);
      expect(c.percentile!).toBeLessThanOrEqual(100);
      expect(c.asOf).not.toBeNull();
    }
    expect(h.components.find((c) => c.id === "xrpl")!.available).toBe(false);
    expect(h.components.find((c) => c.id === "liquidity")!.available).toBe(true);
    expect(h.regime.regime).not.toBe("UNKNOWN");
  });

  it("degrades honestly with short history and no BTC", () => {
    const h = computeMarketHealth(xrp.slice(0, 60), null, null);
    expect(h.regime.regime).toBe("UNKNOWN");
    expect(h.components.find((c) => c.id === "correlation")!.available).toBe(false);
    expect(h.components.find((c) => c.id === "trend")!.available).toBe(false);
    expect(h.components.find((c) => c.id === "liquidity")!.available).toBe(false);
  });
});
