import { describe, expect, it } from "vitest";
import { cleanUrl, decodeEntities, jaccard, makeExcerpt, normalizeTitle, stripHtml, titleTokens, truncateText } from "@/lib/news/text";

describe("news text utils", () => {
  it("strips HTML, scripts and decodes entities", () => {
    const html = `<p>Ripple&#8217;s <b>RLUSD</b> &amp; XRP</p><script>alert(1)</script><style>.x{}</style><img src="x.png"/>`;
    expect(stripHtml(html)).toBe("Ripple’s RLUSD & XRP");
  });
  it("handles CDATA and double-encoded entities", () => {
    expect(stripHtml("<![CDATA[<p>Hello &amp;amp; world&amp;#8230;</p>]]>")).toBe("Hello & world…");
    expect(decodeEntities("&lt;b&gt;x&lt;/b&gt;")).toBe("<b>x</b>");
  });
  it("truncates at a word boundary with ellipsis and never exceeds max", () => {
    const s = "word ".repeat(100);
    const t = truncateText(s, 200);
    expect(t.length).toBeLessThanOrEqual(200);
    expect(t.endsWith("…")).toBe(true);
    expect(truncateText("short text", 200)).toBe("short text");
  });
  it("builds excerpts without boilerplate", () => {
    const e = makeExcerpt("<p>XRP climbs as volume rises.</p><p>The post XRP climbs appeared first on Some Site.</p>", 200);
    expect(e).toBe("XRP climbs as volume rises.");
    const long = makeExcerpt(`<div>${"Lorem ipsum dolor sit amet ".repeat(40)}</div>`);
    expect(long.length).toBeLessThanOrEqual(200);
  });
  it("normalizes titles and computes token similarity", () => {
    expect(normalizeTitle("XRP Price Hits $2.50!")).toBe("xrp price hits $2.50");
    const a = titleTokens("SEC drops appeal against Ripple in XRP case");
    const b = titleTokens("Ripple case: SEC drops its appeal");
    expect(jaccard(a, b)).toBeGreaterThan(0.5);
    expect(jaccard(titleTokens("Bitcoin ETF inflows"), titleTokens("Ethereum developers ship upgrade"))).toBe(0);
  });
  it("cleans URLs and rejects non-http", () => {
    expect(cleanUrl("https://example.com/a?utm_source=x&id=2#frag")).toBe("https://example.com/a?id=2");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("not a url")).toBeNull();
  });
});
