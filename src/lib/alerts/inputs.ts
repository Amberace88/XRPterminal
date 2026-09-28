import type { WalletTxEvent } from "./types";

/**
 * Input adapters for the alert engine (pure; unit-testable).
 */

type Json = Record<string, unknown>;

/** Parse an XRPL `transaction` stream message into an XRP payment event (validated, tesSUCCESS only). */
export function parseStreamTx(msg: Json): WalletTxEvent | null {
  if (msg.type !== "transaction" || msg.validated === false) return null;
  const tx = (msg.transaction ?? msg.tx_json ?? {}) as Json;
  const meta = (msg.meta ?? {}) as Json;
  if (meta.TransactionResult && meta.TransactionResult !== "tesSUCCESS") return null;
  if (tx.TransactionType !== "Payment") return null;
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount ?? tx.DeliverMax ?? tx.Amount;
  if (typeof delivered !== "string" || !/^\d+$/.test(delivered)) return null; // XRP only (drops)
  const amountXrp = Number(delivered) / 1e6;
  const hash = String(msg.hash ?? tx.hash ?? "");
  if (!hash) return null;
  const date = typeof tx.date === "number" ? (tx.date + 946684800) * 1000 : Date.now();
  return { hash, account: String(tx.Account ?? ""), destination: typeof tx.Destination === "string" ? tx.Destination : undefined, amountXrp, type: "Payment", time: date };
}

/**
 * Tolerant extractor for a forecast range from /api/forecast/current (owned by the Future
 * module: `{ forecast: { quantiles: { p05, p95 } } }`). Also accepts {low,high} | {p05,p95} |
 * {lower,upper} | {p25,p75} at the top level or in the first element of `horizons`/`forecasts`.
 */
export function extractForecastRange(data: unknown): { low: number; high: number } | null {
  const tryObj = (o: unknown): { low: number; high: number } | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const pairs: [string, string][] = [
      ["low", "high"],
      ["p05", "p95"],
      ["p5", "p95"],
      ["lower", "upper"],
      ["p10", "p90"],
      ["p25", "p75"],
    ];
    for (const [a, b] of pairs) {
      const lo = Number(r[a]);
      const hi = Number(r[b]);
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo && lo > 0) return { low: lo, high: hi };
    }
    if (r.range) return tryObj(r.range);
    return null;
  };
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  const fc = d.forecast as Record<string, unknown> | undefined;
  // Future module shape: { forecast: { quantiles: { p05, p95, … } } }
  const candidates: unknown[] = [d, d.quantiles, fc?.quantiles, fc, d.range];
  for (const k of ["horizons", "forecasts", "items", "ranges"]) {
    const v = d[k] ?? (d.forecast as Record<string, unknown> | undefined)?.[k];
    if (Array.isArray(v) && v.length) candidates.push(v[0], (v[0] as Record<string, unknown>)?.range);
  }
  for (const c of candidates) {
    const r = tryObj(c);
    if (r) return r;
  }
  return null;
}
