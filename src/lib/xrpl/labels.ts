/**
 * Wallet labels with provenance (spec §30). Every label says where it came from:
 *  - "xrpscan-well-known": XRPScan's public well-known names list (external)
 *  - "on-ledger-domain": the account's own Domain field (self-declared, unverified)
 *  - "user": entered by the current user (user-provided)
 * A label is never inferred from balance or behaviour here (that is the profiler's job, with explanations).
 */

export type LabelCategory = "EXCHANGE" | "ISSUER" | "KNOWN_SERVICE" | "KNOWN_ENTITY" | "WHALE" | "TRADER" | "HOLDER" | "UNKNOWN";
export type LabelSource = "xrpscan-well-known" | "on-ledger-domain" | "user";

export interface WalletLabel {
  address: string;
  name: string;
  category: LabelCategory;
  source: LabelSource;
  /** Human-readable provenance sentence shown in tooltips. */
  provenance: string;
  provenanceUrl?: string;
  verified?: boolean;
  domain?: string | null;
  twitter?: string | null;
  isUserProvided: boolean;
  /** Free-text description from the source */
  desc?: string | null;
}

export const XRPSCAN_WELL_KNOWN_URL = "https://api.xrpscan.com/api/v1/names/well-known";

/**
 * Brands of centralized exchanges / custodial trading venues. Used ONLY to assign the EXCHANGE
 * category to a name that XRPScan publishes — never to guess an unlabelled address.
 */
export const EXCHANGE_BRANDS = [
  "binance", "bitstamp", "kraken", "coinbase", "bitso", "uphold", "bitfinex", "bithumb", "upbit", "huobi", "htx",
  "okx", "okex", "bybit", "kucoin", "gate.io", "gateio", "crypto.com", "bitrue", "bitbank", "coincheck", "bitflyer",
  "poloniex", "gemini", "coinspot", "independent reserve", "btc markets", "btcmarkets", "wazirx", "bittrex", "mexc",
  "korbit", "coinone", "sbi vc", "bitget", "bitpanda", "etoro", "robinhood", "revolut", "luno", "coins.ph", "btcturk",
  "paribu", "bitvavo", "zaif", "bitpoint", "gopax", "indodax", "coindcx", "bitkub", "hitbtc", "exmo", "cex.io",
  "coinjar", "swyftx", "bitmart", "lbank", "probit", "coinex", "whitebit", "xt.com", "ascendex", "bitglobal",
  "changenow", "changelly", "simpleswap", "stealthex", "nexo", "youhodler", "bitlo", "coinmetro",
];

const ISSUER_HINTS = ["issuer", "gateway", "stablecoin", "rlusd", "gatehub"];

export function categorizeName(name: string, desc?: string | null, domain?: string | null): LabelCategory {
  const hay = `${name} ${desc ?? ""} ${domain ?? ""}`.toLowerCase();
  if (EXCHANGE_BRANDS.some((b) => hay.includes(b))) return "EXCHANGE";
  if (ISSUER_HINTS.some((b) => hay.includes(b))) return "ISSUER";
  return "KNOWN_ENTITY";
}

/** Only externally-sourced exchange labels count for flow analytics (user labels / self-declared domains do not). */
export function isExchangeLabel(l: WalletLabel | null | undefined): boolean {
  return !!l && l.category === "EXCHANGE" && l.source === "xrpscan-well-known";
}

interface RawWellKnown {
  account?: unknown;
  name?: unknown;
  desc?: unknown;
  domain?: unknown;
  twitter?: unknown;
  verified?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Parse XRPScan's well-known array defensively. Invalid rows are dropped. */
export function parseWellKnown(json: unknown, isValidAddress: (a: string) => boolean): WalletLabel[] {
  if (!Array.isArray(json)) return [];
  const out: WalletLabel[] = [];
  for (const r of json as RawWellKnown[]) {
    const account = str(r?.account);
    const name = str(r?.name);
    if (!account || !name || !isValidAddress(account)) continue;
    const desc = str(r.desc);
    const domain = str(r.domain);
    const category = categorizeName(name, desc, domain);
    const verified = r.verified === true;
    const displayName = desc && !/^\d+$/.test(desc) && desc.toLowerCase() !== name.toLowerCase() ? `${name} (${desc})` : desc && /^\d+$/.test(desc) ? `${name} #${desc}` : name;
    out.push({
      address: account,
      name: displayName,
      category,
      source: "xrpscan-well-known",
      provenance:
        `Name published by XRPScan's well-known accounts list${verified ? " (marked verified by XRPScan)" : ""}.` +
        (category === "EXCHANGE" ? " Category EXCHANGE assigned because the published name matches a known exchange brand." : ""),
      provenanceUrl: `https://xrpscan.com/account/${account}`,
      verified,
      domain,
      twitter: str(r.twitter),
      isUserProvided: false,
      desc,
    });
  }
  return out;
}

export function domainLabel(address: string, domain: string): WalletLabel {
  return {
    address,
    name: domain,
    category: "UNKNOWN",
    source: "on-ledger-domain",
    provenance: "Self-declared on-ledger domain (AccountRoot.Domain). Anyone can set any domain; it is not verified.",
    provenanceUrl: `https://${domain.replace(/^https?:\/\//, "").split("/")[0]}/.well-known/xrp-ledger.toml`,
    domain,
    isUserProvided: false,
  };
}

export function userLabel(address: string, name: string, category: LabelCategory = "UNKNOWN"): WalletLabel {
  return {
    address,
    name,
    category,
    source: "user",
    provenance: "User-provided label (entered by you; not verified).",
    isUserProvided: true,
  };
}

export type LabelIndex = Map<string, WalletLabel[]>;

export function indexLabels(...lists: WalletLabel[][]): LabelIndex {
  const m: LabelIndex = new Map();
  for (const list of lists)
    for (const l of list) {
      const arr = m.get(l.address) ?? [];
      if (!arr.some((x) => x.source === l.source && x.name === l.name)) arr.push(l);
      m.set(l.address, arr);
    }
  return m;
}

/** Best label for display: external well-known > user > self-declared domain. */
export function primaryLabel(idx: LabelIndex | null | undefined, address: string | undefined): WalletLabel | null {
  if (!idx || !address) return null;
  const arr = idx.get(address);
  if (!arr?.length) return null;
  const rank: Record<LabelSource, number> = { "xrpscan-well-known": 0, user: 1, "on-ledger-domain": 2 };
  return [...arr].sort((a, b) => rank[a.source] - rank[b.source])[0];
}
