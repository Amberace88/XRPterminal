import { describe, expect, it } from "vitest";
import { categorize, extractEntities, relevanceOf } from "@/lib/news/categorize";

describe("news categorizer", () => {
  it("assigns specific primary categories by priority", () => {
    expect(categorize("Ripple expands RLUSD stablecoin supply").primary).toBe("RLUSD");
    expect(categorize("SEC and Ripple file joint motion in court").primary).toBe("REGULATION");
    expect(categorize("XRPL amendment for AMM clawback reaches validator majority").primary).toBe("XRPL");
    expect(categorize("Exchange hacked, $30M drained from hot wallet").primary).toBe("SECURITY");
    expect(categorize("Ripple Payments adds new cross-border corridor").primary).toBe("PAYMENTS");
    expect(categorize("Asset manager files for spot XRP ETF").primary).toBe("INSTITUTIONAL");
    expect(categorize("Fed holds interest rates steady as CPI cools").primary).toBe("MACRO");
    expect(categorize("XRP price rallies 8% as traders pile in").primary).toBe("MARKET");
  });
  it("returns multiple categories and defaults to MARKET", () => {
    const r = categorize("Coinbase lists RLUSD after SEC approval");
    expect(r.categories).toEqual(expect.arrayContaining(["RLUSD", "REGULATION", "EXCHANGES"]));
    expect(categorize("Something entirely unrelated").categories).toEqual(["MARKET"]);
  });
  it("uses word boundaries (no false positives inside words)", () => {
    expect(categorize("Secure your wallet").categories).not.toContain("REGULATION"); // "sec" inside "secure"
    expect(relevanceOf("Ripplex is a new game")).toBeNull();
  });
  it("filters relevance: XRP vs MARKET vs irrelevant", () => {
    expect(relevanceOf("XRP Ledger hits new milestone")).toBe("XRP");
    expect(relevanceOf("Bitcoin slides as Fed signals higher rates")).toBe("MARKET");
    expect(relevanceOf("Local football team wins cup")).toBeNull();
    expect(relevanceOf("Anything at all", true)).toBe("XRP");
  });
  it("extracts known entities", () => {
    const e = extractEntities("Brad Garlinghouse says Ripple and BlackRock talk tokenization; SEC chair Paul Atkins responds");
    expect(e).toEqual(expect.arrayContaining(["Brad Garlinghouse", "Ripple", "BlackRock", "SEC", "Paul Atkins"]));
  });
});
