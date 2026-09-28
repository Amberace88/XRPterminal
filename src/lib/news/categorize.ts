import type { NewsCategory, NewsRelevance } from "./types";

/**
 * Deterministic keyword categorization, relevance filter and entity extraction (spec §75–76).
 * Rules are documented here and shown on the News page methodology note.
 */

const w = (words: string[]) => new RegExp(`(?:^|[^a-z0-9])(?:${words.join("|")})(?=$|[^a-z0-9])`, "i");

export const CATEGORY_RULES: Record<NewsCategory, RegExp> = {
  RLUSD: w(["rlusd", "ripple usd", "ripple stablecoin", "ripple's stablecoin"]),
  SECURITY: w(["hack(?:s|ed|er|ers)?", "exploit(?:s|ed)?", "breach(?:es)?", "phishing", "scam(?:s|mer|mers)?", "vulnerabilit(?:y|ies)", "stolen", "drain(?:ed|er)?", "malware", "attacker(?:s)?", "fraud(?:ulent)?", "rug ?pull", "wallet drainer"]),
  REGULATION: w([
    "sec",
    "securities and exchange commission",
    "lawsuit",
    "court",
    "judge",
    "ruling",
    "regulat(?:or|ors|ion|ions|ory)",
    "cftc",
    "mica",
    "legislation",
    "bill",
    "congress",
    "senate",
    "lawmakers?",
    "compliance",
    "licen[cs]e[ds]?",
    "torres",
    "appeal",
    "gensler",
    "atkins",
    "clarity act",
    "genius act",
    "ban(?:s|ned)?",
    "enforcement",
    "sanction(?:s|ed)?",
  ]),
  XRPL: w(["xrpl", "xrp ledger", "amendment(?:s)?", "rippled", "validator(?:s)?", "unl", "xls-\\d+", "amm", "hooks", "sidechain", "evm sidechain", "clio", "escrow", "trust ?lines?", "mpt", "multi-purpose tokens?", "xahau", "ledger upgrade"]),
  PAYMENTS: w(["payment(?:s)?", "cross-border", "remittance(?:s)?", "odl", "on-demand liquidity", "ripplenet", "ripple payments", "corridor(?:s)?", "money transfer", "swift"]),
  INSTITUTIONAL: w([
    "etf(?:s)?",
    "etp(?:s)?",
    "bank(?:s|ing)?",
    "institution(?:s|al)?",
    "asset managers?",
    "blackrock",
    "fidelity",
    "grayscale",
    "bitwise",
    "franklin templeton",
    "wisdomtree",
    "21shares",
    "canary capital",
    "coinshares",
    "custody",
    "custodian",
    "treasury company",
    "corporate treasury",
    "fund(?:s)?",
    "s-1",
    "filing(?:s)?",
    "tokeni[sz]ed",
    "tokeni[sz]ation",
  ]),
  EXCHANGES: w(["exchange(?:s)?", "binance", "coinbase", "kraken", "bitstamp", "upbit", "bithumb", "okx", "bybit", "bitso", "robinhood", "gemini", "listing(?:s)?", "delist(?:s|ed|ing)?"]),
  DEVELOPMENT: w(["developer(?:s)?", "sdk", "github", "grant(?:s)?", "open[- ]source", "devnet", "testnet", "api", "library", "xrpl\\.js", "xrpl-py", "hackathon"]),
  TECHNOLOGY: w(["upgrade(?:s|d)?", "protocol", "mainnet", "smart contracts?", "interoperabilit(?:y|ies)", "zero-knowledge", "zk", "quantum", "ai", "artificial intelligence", "blockchain technology", "infrastructure"]),
  RIPPLE: w(["ripple", "ripple labs", "garlinghouse", "david schwartz", "alderoty", "monica long", "hidden road", "ripple prime", "metaco", "standard custody", "gtreasury"]),
  MACRO: w(["fed", "federal reserve", "fomc", "cpi", "inflation", "interest rates?", "rate cut(?:s)?", "rate hike(?:s)?", "jobs report", "payrolls", "recession", "treasury yields?", "bond yields?", "dollar index", "dxy", "tariff(?:s)?", "gdp", "powell", "macro(?:economic)?", "central bank(?:s)?", "ecb"]),
  COMMUNITY: w(["community", "xrp army", "conference", "apex", "meetup", "podcast", "ama", "poll", "survey", "influencer(?:s)?", "summit"]),
  MARKET: w([
    "price(?:s)?",
    "rall(?:y|ies|ied)",
    "surge(?:s|d)?",
    "soar(?:s|ed)?",
    "plunge(?:s|d)?",
    "tumble(?:s|d)?",
    "slump(?:s|ed)?",
    "drop(?:s|ped)?",
    "fall(?:s|en)?",
    "rise(?:s)?",
    "gain(?:s|ed)?",
    "bull(?:s|ish)?",
    "bear(?:s|ish)?",
    "market cap",
    "trading volume",
    "volume",
    "liquidation(?:s)?",
    "futures",
    "open interest",
    "whale(?:s)?",
    "support",
    "resistance",
    "breakout",
    "analyst(?:s)?",
    "chart(?:s)?",
    "all-time high",
    "ath",
    "sell-?off",
    "market(?:s)?",
    "trader(?:s)?",
    "inflow(?:s)?",
    "outflow(?:s)?",
  ]),
};

/** Priority for the single "primary" category — most specific first. */
export const CATEGORY_PRIORITY: NewsCategory[] = [
  "RLUSD",
  "SECURITY",
  "REGULATION",
  "XRPL",
  "PAYMENTS",
  "INSTITUTIONAL",
  "EXCHANGES",
  "DEVELOPMENT",
  "TECHNOLOGY",
  "RIPPLE",
  "MACRO",
  "COMMUNITY",
  "MARKET",
];

export function categorize(text: string): { categories: NewsCategory[]; primary: NewsCategory } {
  const matched = CATEGORY_PRIORITY.filter((c) => CATEGORY_RULES[c].test(text));
  if (matched.length === 0) return { categories: ["MARKET"], primary: "MARKET" };
  return { categories: matched, primary: matched[0] };
}

/** XRP-related keywords (relevance filter). */
export const XRP_KEYWORDS = w([
  "xrp",
  "xrpl",
  "xrp ledger",
  "ripple",
  "rlusd",
  "garlinghouse",
  "david schwartz",
  "alderoty",
  "monica long",
  "ripplenet",
  "odl",
  "on-demand liquidity",
  "xahau",
  "evernorth",
  "hidden road",
  "ripple prime",
]);

/** General crypto-market / macro context kept with a MARKET flag. */
export const MARKET_CONTEXT_KEYWORDS = w([
  "crypto market",
  "cryptocurrenc(?:y|ies)",
  "altcoin(?:s)?",
  "bitcoin",
  "btc",
  "ether(?:eum)?",
  "stablecoin(?:s)?",
  "crypto etf(?:s)?",
  "etf(?:s)?",
  "sec",
  "cftc",
  "fed",
  "federal reserve",
  "fomc",
  "cpi",
  "inflation",
  "interest rates?",
  "rate cut(?:s)?",
  "tariff(?:s)?",
  "market structure",
  "crypto regulation",
  "liquidation(?:s)?",
]);

export function relevanceOf(text: string, xrpScopedFeed = false): NewsRelevance | null {
  if (xrpScopedFeed || XRP_KEYWORDS.test(text)) return "XRP";
  if (MARKET_CONTEXT_KEYWORDS.test(text)) return "MARKET";
  return null;
}

/** Known names list for entity extraction. Label → match pattern. */
export const KNOWN_ENTITIES: { name: string; re: RegExp }[] = [
  ["Ripple", ["ripple", "ripple labs"]],
  ["XRP Ledger", ["xrpl", "xrp ledger"]],
  ["RLUSD", ["rlusd", "ripple usd"]],
  ["SEC", ["sec", "securities and exchange commission"]],
  ["CFTC", ["cftc"]],
  ["Brad Garlinghouse", ["garlinghouse"]],
  ["David Schwartz", ["david schwartz"]],
  ["Stuart Alderoty", ["alderoty"]],
  ["Monica Long", ["monica long"]],
  ["Gary Gensler", ["gensler"]],
  ["Paul Atkins", ["paul atkins"]],
  ["Judge Analisa Torres", ["analisa torres", "judge torres"]],
  ["BlackRock", ["blackrock"]],
  ["Fidelity", ["fidelity"]],
  ["Grayscale", ["grayscale"]],
  ["Bitwise", ["bitwise"]],
  ["Franklin Templeton", ["franklin templeton"]],
  ["WisdomTree", ["wisdomtree"]],
  ["21Shares", ["21shares"]],
  ["Canary Capital", ["canary capital", "canary"]],
  ["CoinShares", ["coinshares"]],
  ["Coinbase", ["coinbase"]],
  ["Binance", ["binance"]],
  ["Kraken", ["kraken"]],
  ["Bitstamp", ["bitstamp"]],
  ["Upbit", ["upbit"]],
  ["Bithumb", ["bithumb"]],
  ["OKX", ["okx"]],
  ["Robinhood", ["robinhood"]],
  ["Federal Reserve", ["federal reserve", "fed", "fomc"]],
  ["Jerome Powell", ["powell"]],
  ["ECB", ["ecb", "european central bank"]],
  ["Hidden Road", ["hidden road", "ripple prime"]],
  ["Metaco", ["metaco"]],
  ["SBI", ["sbi holdings", "sbi"]],
  ["Santander", ["santander"]],
  ["Tranglo", ["tranglo"]],
  ["Mastercard", ["mastercard"]],
  ["Visa", ["visa"]],
  ["DTCC", ["dtcc"]],
  ["CME Group", ["cme"]],
  ["Nasdaq", ["nasdaq"]],
  ["Bitcoin", ["bitcoin", "btc"]],
  ["Ethereum", ["ethereum", "ether"]],
].map(([name, pats]) => ({ name: name as string, re: w(pats as string[]) }));

export function extractEntities(text: string): string[] {
  return KNOWN_ENTITIES.filter((e) => e.re.test(text)).map((e) => e.name);
}
