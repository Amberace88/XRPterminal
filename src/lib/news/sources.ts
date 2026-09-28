import type { NewsSource } from "./types";

/**
 * Public RSS/Atom feeds (headlines + teaser metadata only; we link to the original publisher).
 * Add a provider here — nothing else needs to change (spec §42 provider abstraction).
 */
export const NEWS_SOURCES: NewsSource[] = [
  { id: "coindesk", name: "CoinDesk", feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/", homepage: "https://www.coindesk.com" },
  { id: "cointelegraph-xrp", name: "Cointelegraph", feedUrl: "https://cointelegraph.com/rss/tag/xrp", homepage: "https://cointelegraph.com", xrpScoped: true },
  { id: "cointelegraph", name: "Cointelegraph", feedUrl: "https://cointelegraph.com/rss", homepage: "https://cointelegraph.com" },
  { id: "decrypt", name: "Decrypt", feedUrl: "https://decrypt.co/feed", homepage: "https://decrypt.co" },
  { id: "theblock", name: "The Block", feedUrl: "https://www.theblock.co/rss.xml", homepage: "https://www.theblock.co" },
  { id: "cryptoslate", name: "CryptoSlate", feedUrl: "https://cryptoslate.com/feed/", homepage: "https://cryptoslate.com" },
  { id: "xrpl-blog", name: "XRPL.org Blog", feedUrl: "https://xrpl.org/blog/rss.xml", homepage: "https://xrpl.org/blog", xrpScoped: true, optional: true },
  { id: "utoday", name: "U.Today", feedUrl: "https://u.today/rss", homepage: "https://u.today" },
];

export const NEWS_SOURCE_BY_ID: Record<string, NewsSource> = Object.fromEntries(NEWS_SOURCES.map((s) => [s.id, s]));
