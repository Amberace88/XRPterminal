import type { Candle, MarketSnapshot, Ticker, Timeframe } from "@/lib/types/market";

export type SupportedPair = "XRP-USD" | "XRP-EUR" | "XRP-BTC" | "XRP-ETH" | "BTC-USD" | "ETH-USD";

export interface CandleRequest {
  pair: SupportedPair;
  timeframe: Exclude<Timeframe, "1W" | "1M">; // weekly/monthly are aggregated from daily
  /** inclusive start, UTC ms */
  start?: number;
  /** exclusive end, UTC ms */
  end?: number;
  limit?: number;
}

/**
 * Provider abstraction (spec §20, §42). UI never talks to a specific exchange —
 * it talks to our API routes, which talk to the registry, which talks to providers.
 */
export interface MarketDataProvider {
  id: string;
  name: string;
  /** Pairs this provider can serve natively. */
  pairs: SupportedPair[];
  /** Earliest daily candle this provider typically offers per pair (UTC ms), informational. */
  historyStart?: Partial<Record<SupportedPair, number>>;
  getTicker(pair: SupportedPair): Promise<Ticker>;
  getCandles(req: CandleRequest): Promise<Candle[]>;
}

export interface SnapshotProvider {
  id: string;
  name: string;
  getSnapshot(symbol: "XRP" | "BTC" | "ETH"): Promise<MarketSnapshot>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
  "1M": 2_592_000_000,
};

export function splitPair(pair: SupportedPair): [string, string] {
  const [b, q] = pair.split("-");
  return [b, q];
}
