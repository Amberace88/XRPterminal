import { XMLParser } from "fast-xml-parser";
import { categorize, extractEntities, relevanceOf } from "./categorize";
import { cleanUrl, hashString, makeExcerpt, stripHtml, truncateText } from "./text";
import type { NewsItem, NewsSource } from "./types";

/**
 * RSS 2.0 / Atom parser → metadata-only NewsItems.
 * Keeps: title, source, url, published_at, short excerpt (≤200 chars), categories, entities.
 * Discards: full content (content:encoded etc.), images, authors' bodies.
 */

type Node = unknown;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

function text(n: Node): string {
  if (n === null || n === undefined) return "";
  if (typeof n === "string") return n;
  if (typeof n === "number" || typeof n === "boolean") return String(n);
  if (Array.isArray(n)) return text(n[0]);
  if (typeof n === "object") {
    const o = n as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function arr<T>(n: T | T[] | undefined | null): T[] {
  if (n === undefined || n === null) return [];
  return Array.isArray(n) ? n : [n];
}

function atomLink(link: Node): string {
  const links = arr(link as Record<string, unknown> | Record<string, unknown>[]);
  const alt = links.find((l) => typeof l === "object" && l && (!l["@_rel"] || l["@_rel"] === "alternate"));
  const pick = alt ?? links[0];
  if (typeof pick === "string") return pick;
  if (pick && typeof pick === "object") return String(pick["@_href"] ?? text(pick));
  return "";
}

export interface ParsedFeed {
  items: NewsItem[];
  rawCount: number;
  skipped: number;
}

export interface ParseOptions {
  now?: number;
  maxAgeMs?: number;
  maxItems?: number;
  /** keep items that are neither XRP nor market relevant (tests) */
  keepIrrelevant?: boolean;
}

export function parseFeed(xml: string, source: NewsSource, opts: ParseOptions = {}): ParsedFeed {
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 14 * 86_400_000;
  const maxItems = opts.maxItems ?? 60;
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error("Feed is not valid XML");
  }
  const rss = doc.rss as Record<string, unknown> | undefined;
  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;

  let entries: { title: string; link: string; date: string; desc: string }[] = [];
  if (rss?.channel) {
    const channels = arr<Record<string, unknown>>(rss.channel as Record<string, unknown> | Record<string, unknown>[]);
    const ch: Record<string, unknown> = channels[0] ?? {};
    entries = arr(ch.item as Record<string, unknown>[] | Record<string, unknown>).map((i) => ({
      title: text(i.title),
      link: text(i.link) || (text(i.guid).startsWith("http") ? text(i.guid) : ""),
      date: text(i.pubDate) || text(i["dc:date"]) || text(i.published) || text(i.updated),
      desc: text(i.description) || text(i.summary),
    }));
  } else if (rdf) {
    entries = arr(rdf.item as Record<string, unknown>[] | Record<string, unknown>).map((i) => ({
      title: text(i.title),
      link: text(i.link),
      date: text(i["dc:date"]) || text(i.pubDate),
      desc: text(i.description),
    }));
  } else if (feed) {
    entries = arr(feed.entry as Record<string, unknown>[] | Record<string, unknown>).map((e) => ({
      title: text(e.title),
      link: atomLink(e.link),
      date: text(e.published) || text(e.updated),
      desc: text(e.summary) || "",
    }));
  } else {
    throw new Error("Unrecognized feed format");
  }

  const items: NewsItem[] = [];
  let skipped = 0;
  for (const e of entries) {
    const title = truncateText(stripHtml(e.title), 220);
    const url = cleanUrl(e.link);
    const publishedAt = Date.parse(e.date);
    // Never invent: items without a title, URL or parseable publication date are skipped.
    if (!title || !url || !Number.isFinite(publishedAt)) {
      skipped++;
      continue;
    }
    if (publishedAt > now + 10 * 60_000 || now - publishedAt > maxAge) {
      skipped++;
      continue;
    }
    const excerpt = makeExcerpt(e.desc, 200);
    const hay = `${title} ${excerpt}`;
    const relevance = relevanceOf(hay, source.xrpScoped);
    if (!relevance && !opts.keepIrrelevant) {
      skipped++;
      continue;
    }
    const { categories, primary } = categorize(hay);
    items.push({
      id: hashString(url),
      title,
      source: source.name,
      sourceId: source.id,
      url,
      publishedAt,
      excerpt,
      categories,
      primaryCategory: primary,
      entities: extractEntities(hay),
      relevance: relevance ?? "MARKET",
    });
    if (items.length >= maxItems) break;
  }
  return { items, rawCount: entries.length, skipped };
}
