import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/news/parse";
import type { NewsSource } from "@/lib/news/types";

const SRC: NewsSource = { id: "test", name: "Test Wire", feedUrl: "https://test.example/rss", homepage: "https://test.example" };
const NOW = Date.UTC(2026, 8, 28, 12);

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>
<item><title><![CDATA[Ripple&#8217;s RLUSD hits new supply milestone]]></title><link>https://test.example/rlusd?utm_source=rss</link>
<pubDate>Sun, 27 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>The stablecoin <b>grew</b> quickly.</p>]]></description>
<content:encoded><![CDATA[<p>FULL ARTICLE BODY SHOULD NEVER BE KEPT</p>]]></content:encoded></item>
<item><title>Local bakery wins award</title><link>https://test.example/bakery</link><pubDate>Sun, 27 Sep 2026 09:00:00 GMT</pubDate></item>
<item><title>Bitcoin slips as Fed holds rates</title><link>https://test.example/btc</link><pubDate>Sun, 27 Sep 2026 08:00:00 GMT</pubDate></item>
<item><title>No date XRP story</title><link>https://test.example/nodate</link></item>
<item><title>Old XRP story</title><link>https://test.example/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>XRPL</title>
<entry><title>Introducing a new XRPL amendment</title><link rel="alternate" href="https://xrpl.example/blog/amendment"/><published>2026-09-26T12:00:00Z</published><summary>Validators vote.</summary></entry>
</feed>`;

describe("feed parser", () => {
  it("parses RSS, keeps metadata only, filters relevance and skips undated/old items", () => {
    const r = parseFeed(RSS, SRC, { now: NOW });
    expect(r.rawCount).toBe(5);
    expect(r.items.map((i) => i.url)).toEqual(["https://test.example/rlusd", "https://test.example/btc"]);
    const rl = r.items[0];
    expect(rl.title).toBe("Ripple’s RLUSD hits new supply milestone");
    expect(rl.excerpt).toBe("The stablecoin grew quickly.");
    expect(rl.primaryCategory).toBe("RLUSD");
    expect(rl.relevance).toBe("XRP");
    expect(rl.publishedAt).toBe(Date.UTC(2026, 8, 27, 10));
    expect(JSON.stringify(r.items)).not.toContain("FULL ARTICLE BODY");
    expect(r.items[1].relevance).toBe("MARKET");
  });
  it("parses Atom feeds", () => {
    const r = parseFeed(ATOM, { ...SRC, xrpScoped: true }, { now: NOW });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].url).toBe("https://xrpl.example/blog/amendment");
    expect(r.items[0].primaryCategory).toBe("XRPL");
  });
  it("rejects non-feed XML", () => {
    expect(() => parseFeed("<html><body>nope</body></html>", SRC)).toThrow();
  });
});
