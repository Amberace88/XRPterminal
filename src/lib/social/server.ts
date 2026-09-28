import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { XrplClient } from "@/lib/xrpl/client";
import { log } from "@/lib/server/api";
import { computeTraderMetrics } from "./metrics";
import { dominantQuote, extractDexFills, fifoRoundTrips, openLots } from "./onchain";
import type { AccountTxEntry } from "./verification";
import type { ClosedTrade, TraderMetrics, TraderPrivacy } from "./types";

/** Server helpers for verified traders (service-role writes only). */

export async function fetchAccountTx(address: string, opts: { maxPages?: number; pageSize?: number } = {}): Promise<AccountTxEntry[]> {
  const client = new XrplClient();
  const out: AccountTxEntry[] = [];
  try {
    let marker: unknown = undefined;
    for (let page = 0; page < (opts.maxPages ?? 1); page++) {
      const r: { transactions?: AccountTxEntry[]; marker?: unknown } = await client.request(
        "account_tx",
        { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: opts.pageSize ?? 200, forward: false, ...(marker ? { marker } : {}) },
        20_000,
      );
      out.push(...(r.transactions ?? []));
      marker = r.marker;
      if (!marker) break;
    }
    return out;
  } finally {
    client.close();
  }
}

export interface StoredMetrics {
  metrics: TraderMetrics;
  open: { qty: number; avgPrice: number } | null;
  monthly: { month: string; pnl: number; trades: number }[];
}

export function monthlyHistory(trades: ClosedTrade[]): StoredMetrics["monthly"] {
  const m = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const d = new Date(t.exitTime);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = m.get(k) ?? { pnl: 0, trades: 0 };
    cur.pnl += t.pnl;
    cur.trades++;
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));
}

/** Recompute on-chain metrics for a verified trader account and persist them (service role). */
export async function syncTraderOnchain(admin: SupabaseClient, traderId: string, accountId: string, address: string): Promise<StoredMetrics> {
  const entries = await fetchAccountTx(address, { maxPages: 5, pageSize: 400 });
  const fills = extractDexFills(entries, address);
  const quote = dominantQuote(fills);
  const trades = quote ? fifoRoundTrips(fills, quote) : [];
  const metrics = computeTraderMetrics(trades, { source: "XRPL_DEX", quoteAsset: quote });
  const stored: StoredMetrics = { metrics, open: quote ? openLots(fills, quote) : null, monthly: monthlyHistory(trades) };
  const { error: mErr } = await admin.from("trader_metrics").upsert({
    trader_id: traderId,
    source: "XRPL_DEX",
    quote_asset: quote,
    metrics: stored,
    score: metrics.score,
    eligible: metrics.eligible,
    trade_count: metrics.tradeCount,
    computed_at: new Date().toISOString(),
  });
  if (mErr) log("warn", "trader_metrics upsert failed", { error: mErr.message });
  await admin.from("trader_trades").delete().eq("trader_id", traderId).eq("source", "XRPL_DEX");
  if (trades.length) {
    const rows = trades.slice(-1000).map((t) => ({
      trader_id: traderId,
      source: "XRPL_DEX",
      quote_asset: quote,
      entry_time: new Date(t.entryTime).toISOString(),
      exit_time: new Date(t.exitTime).toISOString(),
      qty: t.qty,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice,
      pnl: t.pnl,
      return_pct: t.returnPct,
      holding_ms: Math.round(t.holdingMs),
      exit_hash: t.exitHash ?? null,
    }));
    const { error } = await admin.from("trader_trades").insert(rows);
    if (error) log("warn", "trader_trades insert failed", { error: error.message });
  }
  await admin.from("trader_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", accountId);
  return stored;
}

export function privacyOf(row: Record<string, unknown>): TraderPrivacy {
  return {
    public_profile: !!row.public_profile,
    public_pnl: !!row.public_pnl,
    public_positions: !!row.public_positions,
    public_trades: !!row.public_trades,
    public_history: !!row.public_history,
    public_wallet: !!row.public_wallet,
    anonymous_stats: row.anonymous_stats !== false,
  };
}

/** Remove fields the trader chose not to publish. */
export function redactMetrics(stored: StoredMetrics | null, p: TraderPrivacy): StoredMetrics | null {
  if (!stored) return null;
  const metrics: TraderMetrics = { ...stored.metrics };
  if (!p.public_pnl) {
    metrics.totalPnl = null;
    metrics.roiPct = null;
  }
  return { metrics, open: p.public_positions ? stored.open : null, monthly: p.public_history ? stored.monthly : [] };
}
