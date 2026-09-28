/**
 * Text utilities for news metadata. Pure & deterministic (safe on server and client).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  dollar: "$",
  bull: "•",
  middot: "·",
};

export function decodeEntities(input: string): string {
  // Two passes handle double-encoded feeds ("&amp;#8217;").
  let s = input;
  for (let pass = 0; pass < 2; pass++) {
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return "";
        try {
          return String.fromCodePoint(n);
        } catch {
          return "";
        }
      }
      const named = NAMED_ENTITIES[code.toLowerCase()];
      return named ?? m;
    });
  }
  return s;
}

/** Strip HTML (incl. script/style blocks & CDATA markers), decode entities and collapse whitespace. */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = s.replace(/<(script|style|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h\d)>/gi, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  // entities may have produced tags (e.g. "&lt;b&gt;") — strip again
  s = s.replace(/<[^>]*>/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Truncate at a word boundary, appending "…" when cut. Never exceeds `max` chars. */
export function truncateText(input: string, max = 200): string {
  const s = input.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, "") + "…";
}

const BOILERPLATE = [
  /the post .{0,200}? appeared first on .{0,80}?\.?$/i,
  /continue reading.*$/i,
  /read more.*$/i,
  /\[…\]|\[\.\.\.\]/g,
];

/** Short excerpt from a feed description: HTML stripped, boilerplate removed, ≤ max chars. */
export function makeExcerpt(html: string | null | undefined, max = 200): string {
  let s = stripHtml(html);
  for (const re of BOILERPLATE) s = s.replace(re, "").trim();
  return truncateText(s, max);
}

const STOPWORDS = new Set(
  "a an the and or but of to in on for at by with from as is are was were be been being it its this that these those into over after before about than then so if not no yes new says say said will would can could may might has have had do does did via amid up down out off just more most very what why how who when where which while vs per xrp crypto price news".split(
    " ",
  ),
);

export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9$%.\s]/g, " ")
    .replace(/(\d)\.(\d)/g, "$1_$2")
    .replace(/\./g, " ")
    .replace(/_/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token set used for similarity: normalized, stopwords removed, naive plural stemming. */
export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (let t of normalizeTitle(title).split(" ")) {
    if (!t || STOPWORDS.has(t)) continue;
    if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
    else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    if (t.length < 2 && !/\d/.test(t)) continue;
    out.add(t);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function intersectionSize(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter;
}

/** FNV-1a 32-bit → hex. Stable ids for URLs / clusters. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Drop tracking parameters; only http(s) URLs are accepted. Returns null for anything else. */
export function cleanUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
