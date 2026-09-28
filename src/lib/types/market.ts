/**
 * Shared market-data types. All timestamps are UTC epoch milliseconds.
 */

export type DataStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

/** Provenance metadata that must accompany every important data object (spec §22, §154). */
export interface Provenance {
  /** Human readable source, e.g. "Binance spot XRPUSDT". */
  source: string;
  /** Provider id from the provider registry, e.g. "binance". */
  provider: string;
  /** Timestamp the data refers to (exchange/ledger time), UTC ms. */
  timestamp: number;
  /** When our system fetched it, UTC ms. */
  fetchedAt: number;
  /** Optional methodology note. */
  methodology?: string;
}

export type Fiat = "USD" | "EUR" | "GBP";
export type Quote = Fiat | "BTC" | "ETH" | "USDT";

export interface Ticker {
  symbol: string; // "XRP"
  quote: Quote; // "USD"
  price: number;
  bid?: number;
  ask?: number;
  open24h?: number;
  high24h?: number;
  low24h?: number;
  change24h?: number; // absolute
  changePct24h?: number; // percent, e.g. -2.31
  volume24hBase?: number; // XRP
  volume24hQuote?: number; // quote currency
  provenance: Provenance;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";

export interface Candle {
  /** Open time, UTC ms */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Base volume (XRP) */
  v: number;
}

export interface CandleSeries {
  symbol: string;
  quote: Quote;
  timeframe: Timeframe;
  candles: Candle[];
  provenance: Provenance;
  /** Data-quality flags raised by validation (spec §157). */
  qualityFlags: string[];
}

export interface MarketSnapshot {
  symbol: string;
  marketCapUsd?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  rank?: number;
  athUsd?: number;
  athDate?: string;
  provenance: Provenance;
}

export interface FxRates {
  base: "USD";
  rates: Record<Fiat, number>;
  provenance: Provenance;
}

export type ProviderStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export interface ProviderHealth {
  id: string;
  name: string;
  kind: "market" | "xrpl" | "news" | "ai" | "fx" | "labels" | "billing" | "database";
  status: ProviderStatus;
  latencyMs?: number;
  lastSuccess?: number;
  lastFailure?: number;
  message?: string;
}

/** Standard API envelope for our route handlers (spec §147). */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable?: boolean } };
