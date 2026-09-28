/**
 * Headline sentiment (news-derived) — spec §81.
 * Deterministic lexicon scoring of real fetched headlines. It measures the TONE of
 * headlines, not the market, and is NOT a price signal.
 */

export type SentimentLabel = "BULLISH" | "NEUTRAL" | "BEARISH" | "MIXED";

export const SENTIMENT_METHODOLOGY =
  "Each XRP-relevant story cluster (duplicates merged, one vote per story) is scored with a fixed word list: positive terms (e.g. surge, rally, approval, adoption, inflows) +1, negative terms (e.g. plunge, lawsuit, hack, outflows, delay) −1, with simple negation handling ('not', 'no', 'fails to'). A headline is bullish if its score > 0, bearish if < 0, otherwise neutral. The aggregate is BULLISH/BEARISH when the net share exceeds ±15%, MIXED when both sides are ≥25% and the net share is small, otherwise NEUTRAL. Fewer than 5 scored headlines → insufficient sample.";

const POSITIVE = [
  "surge", "surges", "surged", "soar", "soars", "soared", "rally", "rallies", "rallied", "gain", "gains", "gained", "rise", "rises", "rising", "rose",
  "jump", "jumps", "jumped", "climb", "climbs", "climbed", "record", "breakout", "approve", "approves", "approved", "approval", "adoption", "adopts",
  "partnership", "partners", "launch", "launches", "launched", "bullish", "win", "wins", "won", "victory", "upgrade", "upgrades", "inflow", "inflows",
  "rebound", "rebounds", "recover", "recovers", "recovery", "boost", "boosts", "expands", "expansion", "milestone", "outperforms", "optimism", "optimistic",
  "greenlight", "green-light", "listing", "lists", "integrates", "integration",
];
const NEGATIVE = [
  "plunge", "plunges", "plunged", "crash", "crashes", "crashed", "drop", "drops", "dropped", "fall", "falls", "fell", "falling", "slump", "slumps",
  "tumble", "tumbles", "tumbled", "decline", "declines", "declined", "loss", "losses", "lose", "loses", "bearish", "lawsuit", "sue", "sues", "sued",
  "hack", "hacked", "exploit", "exploited", "reject", "rejects", "rejected", "rejection", "delay", "delays", "delayed", "outflow", "outflows", "selloff",
  "sell-off", "liquidation", "liquidations", "ban", "bans", "banned", "fraud", "probe", "investigation", "warning", "warns", "fine", "fined", "dump",
  "dumps", "slides", "slid", "sink", "sinks", "sank", "fear", "fears", "concern", "concerns", "scam", "delist", "delists", "delisted",
  "halts", "halted", "weak", "weakness", "pressure",
];
const NEGATORS = new Set(["not", "no", "never", "without", "fails", "fail", "failed", "denies", "denied", "isnt", "wont", "cant", "dont", "doesnt"]);
const POS = new Set(POSITIVE);
const NEG = new Set(NEGATIVE);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Score one headline: positive − negative hits, negation flips the next sentiment word within 2 tokens. */
export function scoreHeadline(text: string): { score: number; hits: string[] } {
  const toks = tokenize(text);
  let score = 0;
  const hits: string[] = [];
  let negateWindow = 0;
  for (const t of toks) {
    if (NEGATORS.has(t)) {
      negateWindow = 3;
      continue;
    }
    let v = POS.has(t) ? 1 : NEG.has(t) ? -1 : 0;
    if (v !== 0) {
      if (negateWindow > 0) v = -v;
      score += v;
      hits.push(`${negateWindow > 0 ? "¬" : ""}${t}`);
      negateWindow = 0;
    } else if (negateWindow > 0) negateWindow--;
  }
  return { score, hits };
}

export interface SentimentInput {
  title: string;
  source: string;
  publishedAt: number;
}

export interface SentimentResult {
  label: SentimentLabel;
  sufficient: boolean;
  sampleSize: number;
  bullish: number;
  bearish: number;
  neutral: number;
  netShare: number; // (bull − bear) / n, −1..1
  sourceCount: number;
  sources: string[];
  periodStart: number | null;
  periodEnd: number | null;
  methodology: string;
  minSample: number;
}

export const SENTIMENT_MIN_SAMPLE = 5;

export function aggregateSentiment(headlines: SentimentInput[]): SentimentResult {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const h of headlines) {
    const { score } = scoreHeadline(h.title);
    if (score > 0) bullish++;
    else if (score < 0) bearish++;
    else neutral++;
  }
  const n = headlines.length;
  const netShare = n ? (bullish - bearish) / n : 0;
  const bullShare = n ? bullish / n : 0;
  const bearShare = n ? bearish / n : 0;
  let label: SentimentLabel = "NEUTRAL";
  if (bullShare >= 0.25 && bearShare >= 0.25 && Math.abs(netShare) < 0.15) label = "MIXED";
  else if (netShare >= 0.15) label = "BULLISH";
  else if (netShare <= -0.15) label = "BEARISH";
  const sources = [...new Set(headlines.map((h) => h.source))];
  const times = headlines.map((h) => h.publishedAt).filter(Number.isFinite);
  return {
    label,
    sufficient: n >= SENTIMENT_MIN_SAMPLE,
    sampleSize: n,
    bullish,
    bearish,
    neutral,
    netShare,
    sourceCount: sources.length,
    sources,
    periodStart: times.length ? Math.min(...times) : null,
    periodEnd: times.length ? Math.max(...times) : null,
    methodology: SENTIMENT_METHODOLOGY,
    minSample: SENTIMENT_MIN_SAMPLE,
  };
}
