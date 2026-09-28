import type { FxRates, MarketSnapshot } from "@/lib/types/market";
import { fetchJson } from "./http";
import type { SnapshotProvider } from "./types";

const CG_IDS = { XRP: "ripple", BTC: "bitcoin", ETH: "ethereum" } as const;

interface CgCoin {
  market_cap_rank?: number;
  last_updated?: string;
  market_data?: {
    market_cap?: { usd?: number };
    circulating_supply?: number;
    total_supply?: number;
    max_supply?: number;
    ath?: { usd?: number };
    ath_date?: { usd?: string };
  };
}

/** CoinGecko — market capitalization & supply (spec §20: "circulating supply where reliable"). */
export const coingecko: SnapshotProvider = {
  id: "coingecko",
  name: "CoinGecko",
  async getSnapshot(symbol) {
    const id = CG_IDS[symbol];
    const c = await fetchJson<CgCoin>(
      "coingecko",
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
      { revalidate: 600, timeoutMs: 10000 },
    );
    const md = c.market_data ?? {};
    const snap: MarketSnapshot = {
      symbol,
      marketCapUsd: md.market_cap?.usd,
      circulatingSupply: md.circulating_supply,
      totalSupply: md.total_supply,
      maxSupply: md.max_supply ?? undefined,
      rank: c.market_cap_rank,
      athUsd: md.ath?.usd,
      athDate: md.ath_date?.usd,
      provenance: {
        source: "CoinGecko aggregated market data",
        provider: "coingecko",
        timestamp: c.last_updated ? Date.parse(c.last_updated) : Date.now(),
        fetchedAt: Date.now(),
        methodology: "Aggregated across exchanges by CoinGecko; supply figures as reported by CoinGecko.",
      },
    };
    return snap;
  },
};

/** ECB reference FX rates via Frankfurter (spec §173: conversion shows source/time). */
export async function getFxRates(): Promise<FxRates> {
  const urls = ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP", "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP"];
  let last: unknown;
  for (const u of urls) {
    try {
      const r = await fetchJson<{ date: string; rates: { EUR: number; GBP: number } }>("frankfurter", u, { revalidate: 3600 });
      return {
        base: "USD",
        rates: { USD: 1, EUR: r.rates.EUR, GBP: r.rates.GBP },
        provenance: {
          source: "European Central Bank reference rates (via Frankfurter)",
          provider: "frankfurter",
          timestamp: Date.parse(r.date + "T16:00:00Z"),
          fetchedAt: Date.now(),
          methodology: "Daily ECB reference rate, published ~16:00 CET on TARGET business days.",
        },
      };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("FX unavailable");
}
