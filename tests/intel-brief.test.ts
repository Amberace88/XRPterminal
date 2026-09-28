import { describe, expect, it } from "vitest";
import { buildDataBrief } from "@/lib/intel/brief";
import { computeHistoryContext, computeRegimeBlock, computeReturns, returnCorrelation, sigmaRange } from "@/lib/intel/metrics";
import type { IntelSnapshot } from "@/lib/intel/types";
import type { Candle } from "@/lib/types/market";

const DAY = 86_400_000;
function series(n: number, f: (i: number) => number, start = Date.UTC(2024, 0, 1)): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = f(i);
    return { t: start + i * DAY, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 + (i % 7) * 10 };
  });
}

describe("intel snapshot metrics", () => {
  const xrp = series(400, (i) => 0.5 + i * 0.001 + Math.sin(i / 5) * 0.02);
  it("computes returns vs past closes", () => {
    const r = computeReturns(xrp, xrp[xrp.length - 1].c);
    const n = xrp.length;
    expect(r.d7).toBeCloseTo((xrp[n - 1].c / xrp[n - 8].c - 1) * 100, 8);
    expect(computeReturns([], null).d1).toBeNull();
  });
  it("computes historical context without lookahead", () => {
    const h = computeHistoryContext(xrp, null);
    expect(h.days).toBe(400);
    expect(h.athClose).toBe(Math.max(...xrp.map((c) => c.c)));
    expect(h.ret30Percentile).not.toBeNull();
    expect(h.volume7vs30).toBeGreaterThan(0);
  });
  it("computes regime block and correlations", () => {
    const b = computeRegimeBlock(xrp, 1);
    expect(b.regime.current).not.toBeNull();
    expect(b.volatility.vol30Pct).toBeGreaterThan(0);
    const btc = series(400, (i) => 30000 * (0.5 + i * 0.001 + Math.sin(i / 5) * 0.02));
    expect(returnCorrelation(xrp, btc, 30)).toBeCloseTo(1, 6);
    expect(returnCorrelation(xrp.slice(0, 10), btc, 30)).toBeNull();
  });
  it("computes symmetric log sigma bands", () => {
    const r = sigmaRange(1, 73, 7);
    expect(r.low * r.high).toBeCloseTo(1, 10);
    expect(r.sigmaPct).toBeCloseTo(73 * Math.sqrt(7 / 365), 8);
  });
});

function snapshot(partial: Partial<IntelSnapshot> = {}): IntelSnapshot {
  return {
    type: "daily",
    asOf: Date.UTC(2026, 8, 28),
    market: { available: true, price: 0.6, changePct24h: 2.5, high24h: 0.61, low24h: 0.58, volume24hQuote: 5e7, provenance: { source: "Coinbase XRP-USD", provider: "coinbase", timestamp: 1, fetchedAt: 1 } },
    returns: { d1: 2.5, d7: -1, d30: 10, d90: 20 },
    history: { available: true, provenance: { source: "Bitstamp XRP-USD", provider: "bitstamp", timestamp: 1, fetchedAt: 1 }, days: 3000, firstDate: Date.UTC(2017, 0, 1), athClose: 3.3, athDate: Date.UTC(2018, 0, 4), pctFromAth: -81, high52w: 0.9, low52w: 0.4, ret30Percentile: 70, ret7Percentile: 40, volume7vs30: 1.2 },
    regime: { current: "RANGE", previous: "TRANSITION", changed: true, explanation: "x", sma50: 0.55, sma200: 0.5, methodologyVersion: "regime-v1.0" },
    risk: { level: "MODERATE", score: 45, topComponents: [{ name: "Volatility percentile", detail: "30D vol at 50th percentile" }], explanation: "x" },
    volatility: { vol30Pct: 60, vol7Pct: 50, percentile: 50 },
    correlation: { btc30: 0.8, btc90: 0.7, eth30: 0.75, eth90: 0.7, btcChange1d: 1, btcChange7d: 2, provider: "bitstamp" },
    xrpl: { available: false, server: null, validatedLedger: null, ledgersSampled: 0, avgTxPerLedger: null, baseFeeXrp: null, loadFactor: null, error: "timeout" },
    news: { available: true, clusters: [{ id: "c1", title: "SEC and Ripple file joint motion", url: "https://news.example/1", source: "CoinDesk", sources: ["CoinDesk", "Decrypt"], sourceCount: 2, publishedAt: 1, category: "REGULATION", categories: ["REGULATION"] }], windowHours: 24, sourcesHealthy: 7, sourcesTotal: 8 },
    sentiment: null,
    providers: [],
    ...partial,
  };
}

describe("deterministic data brief", () => {
  it("produces the 11 daily sections with labelled items", () => {
    const b = buildDataBrief(snapshot());
    expect(b.sections.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(b.sections[0].title).toBe("Market snapshot");
    for (const s of b.sections) {
      expect(s.items.length).toBeGreaterThan(0);
      for (const it of s.items) expect(["FACT", "ANALYSIS", "SCENARIO", "UNAVAILABLE"]).toContain(it.kind);
    }
    // regime change is reported as a FACT
    expect(b.sections[1].items.some((i) => i.kind === "FACT" && i.text.includes("TRANSITION to RANGE"))).toBe(true);
    // unavailable inputs are stated, never filled
    expect(b.sections.find((s) => s.id === "xrpl")!.items[0].kind).toBe("UNAVAILABLE");
    expect(b.sections.find((s) => s.id === "whales")!.items[0].text).toMatch(/Source unavailable/);
    // news facts carry the real URL as source
    const news = b.sections.find((s) => s.id === "news")!;
    expect(news.items[0].sources[0].url).toBe("https://news.example/1");
    expect(news.items[0].text).toMatch(/reported by 2 sources/);
    // scenarios are labelled SCENARIO and say not a forecast
    const sc = b.sections.find((s) => s.id === "scenarios")!;
    expect(sc.items.some((i) => i.kind === "SCENARIO")).toBe(true);
    expect(sc.items.map((i) => i.text).join(" ")).toMatch(/not forecasts/);
  });
  it("weekly brief lists upcoming events as unavailable instead of inventing them", () => {
    const b = buildDataBrief(snapshot({ type: "weekly" }));
    expect(b.title).toBe("Weekly XRP brief");
    const watch = b.sections.find((s) => s.id === "watch")!;
    expect(watch.items.some((i) => i.kind === "UNAVAILABLE" && /Upcoming scheduled events/.test(i.text))).toBe(true);
  });
  it("handles a fully unavailable snapshot", () => {
    const b = buildDataBrief(
      snapshot({
        market: { available: false, price: null, changePct24h: null, high24h: null, low24h: null, volume24hQuote: null, provenance: null, error: "down" },
        history: { available: false, provenance: null, days: 0, firstDate: null, athClose: null, athDate: null, pctFromAth: null, high52w: null, low52w: null, ret30Percentile: null, ret7Percentile: null, volume7vs30: null },
        regime: { current: null, previous: null, changed: false, explanation: null, sma50: null, sma200: null, methodologyVersion: null },
        risk: { level: null, score: null, topComponents: [], explanation: null },
        volatility: { vol30Pct: null, vol7Pct: null, percentile: null },
        correlation: { btc30: null, btc90: null, eth30: null, eth90: null, btcChange1d: null, btcChange7d: null, provider: null },
        news: { available: false, clusters: [], windowHours: 24, sourcesHealthy: 0, sourcesTotal: 8 },
      }),
    );
    expect(b.headline).toBe("Market data unavailable");
    expect(b.sections[0].items[0].kind).toBe("UNAVAILABLE");
  });
});
