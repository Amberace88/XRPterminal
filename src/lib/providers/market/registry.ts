import type { CandleSeries, ProviderHealth, Ticker, Timeframe } from "@/lib/types/market";
import { binance } from "./binance";
import { bitstamp } from "./bitstamp";
import { coinbase } from "./coinbase";
import { kraken } from "./kraken";
import { aggregateCandles, validateCandles } from "./quality";
import { TIMEFRAME_MS, type MarketDataProvider, type SupportedPair } from "./types";

/**
 * Provider registry with documented source priority and fallback (spec §306/§307).
 * A series is ALWAYS served from a single provider — sources are never stitched silently.
 */
export const MARKET_PROVIDERS: Record<string, MarketDataProvider> = { coinbase, kraken, bitstamp, binance };

/** Priority for live/intraday data: USD-native regulated venues first, USDT proxy last. */
export const TICKER_PRIORITY = ["coinbase", "kraken", "bitstamp", "binance"];
/** Priority for long daily history: longest continuous USD history first. */
export const DAILY_HISTORY_PRIORITY = ["bitstamp", "coinbase", "binance", "kraken"];
export const INTRADAY_PRIORITY = ["coinbase", "kraken", "binance", "bitstamp"];

/* ------------ in-memory provider health (per server instance) ------------ */
const health = new Map<string, ProviderHealth>();
function record(id: string, ok: boolean, latencyMs: number, message?: string) {
  const prev = health.get(id);
  const now = Date.now();
  health.set(id, {
    id,
    name: MARKET_PROVIDERS[id]?.name ?? id,
    kind: "market",
    status: ok ? (latencyMs > 4000 ? "DEGRADED" : "HEALTHY") : "DOWN",
    latencyMs,
    lastSuccess: ok ? now : prev?.lastSuccess,
    lastFailure: ok ? prev?.lastFailure : now,
    message: ok ? undefined : message,
  });
}
export function getMarketProviderHealth(): ProviderHealth[] {
  return Object.keys(MARKET_PROVIDERS).map(
    (id) => health.get(id) ?? { id, name: MARKET_PROVIDERS[id].name, kind: "market", status: "UNKNOWN" as const },
  );
}

async function timed<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    record(id, true, Date.now() - t0);
    return r;
  } catch (e) {
    record(id, false, Date.now() - t0, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function getTicker(pair: SupportedPair, prefer?: string): Promise<{ ticker: Ticker; attempted: string[] }> {
  const order = prefer ? [prefer, ...TICKER_PRIORITY.filter((p) => p !== prefer)] : TICKER_PRIORITY;
  const attempted: string[] = [];
  for (const id of order) {
    const p = MARKET_PROVIDERS[id];
    if (!p || !p.pairs.includes(pair)) continue;
    attempted.push(id);
    try {
      const ticker = await timed(id, () => p.getTicker(pair));
      if (Number.isFinite(ticker.price) && ticker.price > 0) return { ticker, attempted };
    } catch {
      /* fall through to next provider */
    }
  }
  throw new Error(`No provider could serve ${pair} (tried: ${attempted.join(", ") || "none"})`);
}

export interface CandleQuery {
  pair: SupportedPair;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
  prefer?: string;
}

export async function getCandleSeries(q: CandleQuery): Promise<CandleSeries & { attempted: string[] }> {
  const { pair, timeframe } = q;
  const isDailyPlus = timeframe === "1D" || timeframe === "1W" || timeframe === "1M";
  const base = timeframe === "1W" || timeframe === "1M" ? "1D" : timeframe;
  const order = q.prefer
    ? [q.prefer, ...(isDailyPlus ? DAILY_HISTORY_PRIORITY : INTRADAY_PRIORITY).filter((p) => p !== q.prefer)]
    : isDailyPlus
      ? DAILY_HISTORY_PRIORITY
      : INTRADAY_PRIORITY;
  const attempted: string[] = [];
  let lastErr: unknown;
  for (const id of order) {
    const p = MARKET_PROVIDERS[id];
    if (!p || !p.pairs.includes(pair)) continue;
    attempted.push(id);
    try {
      const fetchTf = base === "4h" && id === "coinbase" ? "1h" : base;
      const limitMult = fetchTf !== base ? 4 : 1;
      let limit = q.limit ? q.limit * limitMult : undefined;
      if (timeframe === "1W") limit = (q.limit ?? 200) * 7;
      if (timeframe === "1M") limit = (q.limit ?? 120) * 31;
      const start = q.start ?? (limit ? (q.end ?? Date.now()) - limit * TIMEFRAME_MS[fetchTf as Timeframe] : undefined);
      let raw = await timed(id, () => p.getCandles({ pair, timeframe: fetchTf as never, start, end: q.end, limit }));
      if (fetchTf !== base) raw = aggregateCandles(raw, base);
      const { candles, flags } = validateCandles(raw, base);
      if (candles.length < 2) throw new Error("insufficient candles");
      const final = timeframe === "1W" || timeframe === "1M" ? aggregateCandles(candles, timeframe) : candles;
      const [b, qc] = pair.split("-");
      const usdtProxy = id === "binance" && qc === "USD";
      return {
        symbol: b,
        quote: qc as CandleSeries["quote"],
        timeframe,
        candles: final,
        qualityFlags: flags,
        attempted,
        provenance: {
          source: `${p.name} ${pair}${usdtProxy ? " (USDT as USD proxy)" : ""}`,
          provider: id,
          timestamp: final[final.length - 1].t,
          fetchedAt: Date.now(),
          methodology:
            timeframe === "1W" || timeframe === "1M"
              ? `Aggregated from ${p.name} daily candles (UTC buckets).`
              : fetchTf !== base
                ? `Aggregated from ${p.name} 1h candles into 4h UTC buckets.`
                : `Native ${p.name} ${base} candles, UTC.`,
        },
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `No provider could serve ${pair} ${timeframe} (tried: ${attempted.join(", ") || "none"}): ${lastErr instanceof Error ? lastErr.message : ""}`,
  );
}

/** Full daily history for analytics (Historical/Future intelligence). Single provider, longest history first. */
export async function getDailyHistory(pair: SupportedPair = "XRP-USD", since = Date.UTC(2017, 0, 1)) {
  return getCandleSeries({ pair, timeframe: "1D", start: since });
}
