import "server-only";
import { getDailyHistory, getTicker } from "@/lib/providers/market/registry";
import { getNewsFeed } from "@/lib/news/server";
import { XrplClient } from "@/lib/xrpl/client";
import { aggregateSentiment } from "@/lib/social/sentiment";
import type { Candle, Provenance } from "@/lib/types/market";
import { computeHistoryContext, computeRegimeBlock, computeReturns, pctChange, returnCorrelation } from "./metrics";
import type { IntelSnapshot } from "./types";

/**
 * Builds the structured snapshot every brief / answer is grounded in.
 * Each input fails independently (reported as unavailable) — nothing is filled in.
 */
const MEMO_TTL = 5 * 60_000;
const memo = new Map<string, { at: number; snap: IntelSnapshot }>();
const inflight = new Map<string, Promise<IntelSnapshot>>();

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 160) : "unavailable";
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error(`${label} timed out`)), ms)))]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function sampleXrpl(ledgers = 8): Promise<IntelSnapshot["xrpl"]> {
  const client = new XrplClient();
  try {
    return await withTimeout(
      (async () => {
        const si = await client.request<{ info?: { validated_ledger?: { seq?: number; base_fee_xrp?: number }; load_factor?: number } }>("server_info", {}, 6000);
        const seq = si.info?.validated_ledger?.seq ?? null;
        let counts: number[] = [];
        if (seq) {
          const reqs = Array.from({ length: ledgers }, (_, k) =>
            client
              .request<{ ledger?: { transactions?: unknown[] } }>("ledger", { ledger_index: seq - k, transactions: true, expand: false }, 6000)
              .then((r) => (Array.isArray(r.ledger?.transactions) ? r.ledger!.transactions!.length : null))
              .catch(() => null),
          );
          counts = (await Promise.all(reqs)).filter((x): x is number => x !== null);
        }
        return {
          available: seq !== null,
          server: client.server,
          validatedLedger: seq,
          ledgersSampled: counts.length,
          avgTxPerLedger: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null,
          baseFeeXrp: si.info?.validated_ledger?.base_fee_xrp ?? null,
          loadFactor: si.info?.load_factor ?? null,
        };
      })(),
      12_000,
      "XRPL",
    );
  } catch (e) {
    return { available: false, server: null, validatedLedger: null, ledgersSampled: 0, avgTxPerLedger: null, baseFeeXrp: null, loadFactor: null, error: errMsg(e) };
  } finally {
    client.close();
  }
}

async function build(type: "daily" | "weekly"): Promise<IntelSnapshot> {
  const now = Date.now();
  const [tickerR, xrpR, btcR, ethR, newsR, xrpl] = await Promise.allSettled([
    getTicker("XRP-USD"),
    getDailyHistory("XRP-USD"),
    getDailyHistory("BTC-USD"),
    getDailyHistory("ETH-USD"),
    getNewsFeed(),
    sampleXrpl(),
  ]);

  const ticker = tickerR.status === "fulfilled" ? tickerR.value.ticker : null;
  const xrp: Candle[] = xrpR.status === "fulfilled" ? xrpR.value.candles : [];
  const xrpProv: Provenance | null = xrpR.status === "fulfilled" ? xrpR.value.provenance : null;
  const btc: Candle[] = btcR.status === "fulfilled" ? btcR.value.candles : [];
  const eth: Candle[] = ethR.status === "fulfilled" ? ethR.value.candles : [];
  const price = ticker?.price ?? (xrp.length ? xrp[xrp.length - 1].c : null);
  const providers = new Set<string>();
  if (ticker) providers.add(ticker.provenance.source);
  if (xrpProv) providers.add(`${xrpProv.source} daily`);

  const lag = type === "weekly" ? 7 : 1;
  const regimeBlock = xrp.length
    ? computeRegimeBlock(xrp, lag)
    : {
        regime: { current: null, previous: null, changed: false, explanation: null, sma50: null, sma200: null, methodologyVersion: null },
        risk: { level: null, score: null, topComponents: [], explanation: null },
        volatility: { vol30Pct: null, vol7Pct: null, percentile: null },
      };

  const windowHours = type === "weekly" ? 168 : 24;
  const feed = newsR.status === "fulfilled" ? newsR.value : null;
  const xrpClusters = feed ? feed.clusters.filter((c) => c.relevance === "XRP" && now - c.lastPublishedAt <= windowHours * 3_600_000) : [];
  if (feed) providers.add("Public RSS news feeds");
  if (xrpl.status === "fulfilled" && xrpl.value.available) providers.add("XRP Ledger public servers");

  const btcLast = btc.length ? btc[btc.length - 1].c : null;
  return {
    type,
    asOf: now,
    market: {
      available: !!ticker,
      price,
      changePct24h: ticker?.changePct24h ?? null,
      high24h: ticker?.high24h ?? null,
      low24h: ticker?.low24h ?? null,
      volume24hQuote: ticker?.volume24hQuote ?? null,
      provenance: ticker?.provenance ?? null,
      error: tickerR.status === "rejected" ? errMsg(tickerR.reason) : undefined,
    },
    returns: computeReturns(xrp, price),
    history: xrp.length
      ? { available: true, provenance: xrpProv, ...computeHistoryContext(xrp, price) }
      : {
          available: false,
          provenance: null,
          days: 0,
          firstDate: null,
          athClose: null,
          athDate: null,
          pctFromAth: null,
          high52w: null,
          low52w: null,
          ret30Percentile: null,
          ret7Percentile: null,
          volume7vs30: null,
          error: xrpR.status === "rejected" ? errMsg(xrpR.reason) : undefined,
        },
    ...regimeBlock,
    correlation: {
      btc30: xrp.length && btc.length ? returnCorrelation(xrp, btc, 30) : null,
      btc90: xrp.length && btc.length ? returnCorrelation(xrp, btc, 90) : null,
      eth30: xrp.length && eth.length ? returnCorrelation(xrp, eth, 30) : null,
      eth90: xrp.length && eth.length ? returnCorrelation(xrp, eth, 90) : null,
      btcChange1d: btc.length > 1 ? pctChange(btc[btc.length - 2].c, btcLast) : null,
      btcChange7d: btc.length > 8 ? pctChange(btc[btc.length - 8].c, btcLast) : null,
      provider: btcR.status === "fulfilled" ? btcR.value.provenance.provider : null,
    },
    xrpl: xrpl.status === "fulfilled" ? xrpl.value : { available: false, server: null, validatedLedger: null, ledgersSampled: 0, avgTxPerLedger: null, baseFeeXrp: null, loadFactor: null, error: "unavailable" },
    news: {
      available: !!feed,
      windowHours,
      sourcesHealthy: feed ? feed.sources.filter((s) => s.status !== "DOWN").length : 0,
      sourcesTotal: feed ? feed.sources.length : 0,
      error: newsR.status === "rejected" ? errMsg(newsR.reason) : undefined,
      clusters: xrpClusters.slice(0, 15).map((c) => ({
        id: c.id,
        title: c.title,
        url: c.lead.url,
        source: c.lead.source,
        sources: c.sources,
        sourceCount: c.sourceCount,
        publishedAt: c.firstPublishedAt,
        category: c.primaryCategory,
        categories: c.categories,
      })),
    },
    sentiment: xrpClusters.length ? aggregateSentiment(xrpClusters.map((c) => ({ title: c.title, source: c.lead.source, publishedAt: c.firstPublishedAt }))) : null,
    providers: [...providers],
  };
}

export async function getSnapshot(type: "daily" | "weekly"): Promise<IntelSnapshot> {
  const m = memo.get(type);
  if (m && Date.now() - m.at < MEMO_TTL) return m.snap;
  const existing = inflight.get(type);
  if (existing) return existing;
  const p = build(type)
    .then((snap) => {
      memo.set(type, { at: Date.now(), snap });
      return snap;
    })
    .finally(() => inflight.delete(type));
  inflight.set(type, p);
  return p;
}

/** Compact version for AI prompts (spec §159: don't send huge raw datasets). */
export function compactSnapshot(s: IntelSnapshot) {
  return {
    type: s.type,
    asOf: new Date(s.asOf).toISOString(),
    market: { price_usd: s.market.price, change_24h_pct: s.market.changePct24h, high_24h: s.market.high24h, low_24h: s.market.low24h, volume_24h_usd_single_venue: s.market.volume24hQuote, source: s.market.provenance?.source ?? null },
    returns_pct: s.returns,
    history: {
      provider_history_start: s.history.firstDate ? new Date(s.history.firstDate).toISOString().slice(0, 10) : null,
      highest_daily_close: s.history.athClose,
      highest_daily_close_date: s.history.athDate ? new Date(s.history.athDate).toISOString().slice(0, 10) : null,
      pct_from_highest_close: s.history.pctFromAth,
      high_52w: s.history.high52w,
      low_52w: s.history.low52w,
      ret30_percentile_vs_history: s.history.ret30Percentile,
      volume_7d_vs_30d_ratio: s.history.volume7vs30,
    },
    regime: { current: s.regime.current, previous: s.regime.previous, changed: s.regime.changed, sma50: s.regime.sma50, sma200: s.regime.sma200, explanation: s.regime.explanation },
    risk: s.risk,
    volatility_annualized_pct: s.volatility,
    correlation_daily_returns: s.correlation,
    xrpl_sample: s.xrpl,
    whale_activity: "unavailable in this pipeline",
    exchange_flows: "unavailable in this pipeline",
    headline_sentiment: s.sentiment ? { label: s.sentiment.sufficient ? s.sentiment.label : "INSUFFICIENT_SAMPLE", sample: s.sentiment.sampleSize, publishers: s.sentiment.sourceCount } : null,
  };
}
