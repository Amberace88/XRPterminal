import { describe, expect, it } from "vitest";
import { clusterItems, dedupeItems, deriveEvents } from "@/lib/news/cluster";
import type { NewsItem } from "@/lib/news/types";

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 20, 12);
let n = 0;
function item(title: string, source: string, t: number, extra: Partial<NewsItem> = {}): NewsItem {
  n++;
  return {
    id: `id${n}`,
    title,
    source,
    sourceId: source.toLowerCase(),
    url: `https://${source.toLowerCase().replace(/\s/g, "")}.example/${n}`,
    publishedAt: t,
    excerpt: "",
    categories: ["REGULATION"],
    primaryCategory: "REGULATION",
    entities: [],
    relevance: "XRP",
    ...extra,
  };
}

describe("news dedupe & clustering", () => {
  it("drops exact duplicates (same URL or same title from same publisher)", () => {
    const a = item("SEC drops appeal in Ripple case", "CoinDesk", T0);
    const b = { ...a, id: "dup" };
    const c = item("SEC drops appeal in Ripple case", "CoinDesk", T0 + H);
    expect(dedupeItems([a, b, c])).toHaveLength(1);
  });

  it("clusters the same story from different publishers within the window", () => {
    const items = [
      item("SEC drops appeal against Ripple in landmark XRP case", "CoinDesk", T0),
      item("Ripple case: SEC drops appeal, ending landmark XRP fight", "Decrypt", T0 + 2 * H),
      item("SEC officially drops its appeal against Ripple in XRP case", "The Block", T0 + 5 * H),
      item("Bitcoin miners face pressure as hashprice falls", "CryptoSlate", T0 + H, { relevance: "MARKET", categories: ["MARKET"], primaryCategory: "MARKET" }),
    ];
    const clusters = clusterItems(items);
    expect(clusters).toHaveLength(2);
    const sec = clusters.find((c) => c.sourceCount > 1)!;
    expect(sec.sourceCount).toBe(3);
    expect(sec.sources).toEqual(expect.arrayContaining(["CoinDesk", "Decrypt", "The Block"]));
    expect(sec.lead.source).toBe("CoinDesk"); // earliest report leads
    expect(sec.firstPublishedAt).toBe(T0);
  });

  it("does not cluster similar titles far apart in time", () => {
    const items = [item("SEC drops appeal against Ripple in XRP case", "CoinDesk", T0), item("SEC drops appeal against Ripple in XRP case again", "Decrypt", T0 + 100 * H)];
    expect(clusterItems(items)).toHaveLength(2);
  });

  it("derives events only from REGULATION/INSTITUTIONAL/XRPL clusters with source labels", () => {
    const items = [
      item("SEC drops appeal against Ripple in landmark XRP case", "CoinDesk", T0),
      item("Ripple case: SEC drops appeal, ending landmark XRP fight", "Decrypt", T0 + H),
      item("Asset manager files amended XRP ETF prospectus", "U.Today", T0 + 3 * H, { categories: ["INSTITUTIONAL"], primaryCategory: "INSTITUTIONAL" }),
      item("XRP price rallies 5% on strong volume", "CryptoSlate", T0 + 4 * H, { categories: ["MARKET"], primaryCategory: "MARKET" }),
    ];
    const events = deriveEvents(clusterItems(items));
    expect(events).toHaveLength(2);
    const multi = events.find((e) => e.verification === "MULTI_SOURCE")!;
    expect(multi.label).toBe("Reported by 2 sources");
    const single = events.find((e) => e.verification === "SINGLE_SOURCE")!;
    expect(single.label).toBe("Single source — unverified");
    expect(single.firstReportedAt).toBe(T0 + 3 * H);
  });
});
