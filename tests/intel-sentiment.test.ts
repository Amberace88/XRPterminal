import { describe, expect, it } from "vitest";
import { aggregateSentiment, scoreHeadline } from "@/lib/social/sentiment";

const h = (title: string, source = "A", t = 1) => ({ title, source, publishedAt: t });

describe("headline sentiment lexicon", () => {
  it("scores positive, negative and neutral headlines", () => {
    expect(scoreHeadline("XRP surges as ETF inflows climb").score).toBeGreaterThan(0);
    expect(scoreHeadline("XRP plunges after exchange hack").score).toBeLessThan(0);
    expect(scoreHeadline("Ripple publishes quarterly report").score).toBe(0);
  });
  it("handles negation", () => {
    expect(scoreHeadline("SEC does not approve XRP ETF").score).toBeLessThan(0);
    expect(scoreHeadline("XRP fails to rally").score).toBeLessThan(0);
    expect(scoreHeadline("No crash in sight for XRP").score).toBeGreaterThan(0);
  });
  it("aggregates into BULLISH / BEARISH / MIXED / NEUTRAL with sample metadata", () => {
    const bull = aggregateSentiment([h("XRP surges"), h("XRP rallies", "B"), h("Adoption grows", "C"), h("Report released"), h("ETF approval boosts XRP")]);
    expect(bull.label).toBe("BULLISH");
    expect(bull.sufficient).toBe(true);
    expect(bull.sourceCount).toBe(3);
    const bear = aggregateSentiment([h("XRP plunges"), h("Lawsuit filed"), h("Exchange hacked"), h("Update released"), h("Outflows rise sharply")]);
    expect(bear.label).toBe("BEARISH");
    const mixed = aggregateSentiment([h("XRP surges"), h("XRP rallies"), h("XRP plunges"), h("XRP tumbles"), h("Report out"), h("Notes")]);
    expect(mixed.label).toBe("MIXED");
    const neutral = aggregateSentiment([h("Report released"), h("Conference scheduled"), h("Team update"), h("XRP surges"), h("Notes"), h("Recap"), h("Weekly summary")]);
    expect(neutral.label).toBe("NEUTRAL");
  });
  it("flags insufficient samples", () => {
    const r = aggregateSentiment([h("XRP surges"), h("XRP rallies")]);
    expect(r.sufficient).toBe(false);
    expect(r.sampleSize).toBe(2);
    expect(aggregateSentiment([]).periodStart).toBeNull();
  });
});
