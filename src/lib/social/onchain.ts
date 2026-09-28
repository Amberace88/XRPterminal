import { txHash, txOf, txTimeMs, type AccountTxEntry } from "./verification";
import type { ClosedTrade } from "./types";

/**
 * Derive DEX fills for a verified XRPL account from ledger metadata (balance changes).
 * A fill = a transaction in which the account's XRP balance (excluding its own fee) and
 * exactly one issued-currency balance changed in OPPOSITE directions (offer crossing,
 * either by the account's own OfferCreate or by someone consuming its standing offer).
 * Plain payments and transfers are excluded. All values come from validated ledger data.
 */

type Json = Record<string, unknown>;

export interface DexFill {
  hash: string;
  time: number;
  side: "BUY" | "SELL"; // buying or selling XRP
  xrp: number;
  quote: string; // "CUR.issuer"
  quoteAmount: number;
  price: number; // quote per XRP
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
}

interface Change {
  xrp: number;
  iou: Map<string, number>;
}

export function balanceChanges(entry: AccountTxEntry, address: string): Change | null {
  const meta = typeof entry.meta === "object" && entry.meta ? (entry.meta as Json) : null;
  if (!meta || meta.TransactionResult !== "tesSUCCESS") return null;
  const tx = txOf(entry);
  const nodes = Array.isArray(meta.AffectedNodes) ? (meta.AffectedNodes as Json[]) : [];
  let xrpDrops = 0;
  const iou = new Map<string, number>();
  for (const wrap of nodes) {
    const kind = Object.keys(wrap)[0];
    const n = wrap[kind] as Json;
    const type = n.LedgerEntryType;
    const final = (n.FinalFields ?? n.NewFields ?? {}) as Json;
    const prev = (n.PreviousFields ?? {}) as Json;
    if (type === "AccountRoot" && final.Account === address) {
      if (prev.Balance === undefined && kind !== "CreatedNode") continue;
      const after = num(final.Balance);
      const before = kind === "CreatedNode" ? 0 : num(prev.Balance);
      if (Number.isFinite(after) && Number.isFinite(before)) xrpDrops += after - before;
    } else if (type === "RippleState") {
      const hi = final.HighLimit as Json | undefined;
      const lo = final.LowLimit as Json | undefined;
      const bal = final.Balance as Json | undefined;
      if (!hi || !lo || !bal) continue;
      const isLow = lo.issuer === address;
      const isHigh = hi.issuer === address;
      if (!isLow && !isHigh) continue;
      const after = num(bal.value);
      const prevBal = prev.Balance as Json | undefined;
      const before = kind === "CreatedNode" ? 0 : prevBal ? num(prevBal.value) : after;
      if (!Number.isFinite(after) || !Number.isFinite(before) || after === before) continue;
      const delta = isLow ? after - before : -(after - before);
      const issuer = String(isLow ? hi.issuer : lo.issuer);
      const key = `${String(bal.currency)}.${issuer}`;
      iou.set(key, (iou.get(key) ?? 0) + delta);
    }
  }
  // exclude the account's own fee from the XRP delta
  if (tx.Account === address) xrpDrops += num(tx.Fee) || 0;
  return { xrp: xrpDrops / 1e6, iou };
}

export function extractDexFills(entries: AccountTxEntry[], address: string): DexFill[] {
  const fills: DexFill[] = [];
  for (const e of entries) {
    const tx = txOf(e);
    const type = tx.TransactionType;
    if (type !== "OfferCreate" && type !== "Payment" && type !== "OfferCancel" && tx.Account === address) continue;
    // Payments sent by the account to a different destination are transfers, not trades.
    if (type === "Payment" && tx.Account === address && tx.Destination !== address) continue;
    const ch = balanceChanges(e, address);
    if (!ch) continue;
    const nonZero = [...ch.iou.entries()].filter(([, v]) => Math.abs(v) > 1e-12);
    if (nonZero.length !== 1 || Math.abs(ch.xrp) < 1e-6) continue;
    const [quote, q] = nonZero[0];
    if (Math.sign(q) === Math.sign(ch.xrp)) continue;
    const time = txTimeMs(e);
    const hash = txHash(e);
    if (time === null || !hash) continue;
    const xrp = Math.abs(ch.xrp);
    const quoteAmount = Math.abs(q);
    fills.push({ hash, time, side: ch.xrp > 0 ? "BUY" : "SELL", xrp, quote, quoteAmount, price: quoteAmount / xrp });
  }
  return fills.sort((a, b) => a.time - b.time);
}

/** Most frequently traded quote asset (so P&L is measured in one currency). */
export function dominantQuote(fills: DexFill[]): string | null {
  const c = new Map<string, number>();
  for (const f of fills) c.set(f.quote, (c.get(f.quote) ?? 0) + 1);
  const best = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/**
 * FIFO round trips (long XRP vs one quote asset). SELLs with no matched inventory are
 * skipped (unknown cost basis → never guessed).
 */
export function fifoRoundTrips(fills: DexFill[], quote: string): ClosedTrade[] {
  const lots: { qty: number; price: number; time: number }[] = [];
  const out: ClosedTrade[] = [];
  for (const f of fills) {
    if (f.quote !== quote) continue;
    if (f.side === "BUY") {
      lots.push({ qty: f.xrp, price: f.price, time: f.time });
      continue;
    }
    let remaining = f.xrp;
    let qty = 0;
    let cost = 0;
    let timeWeighted = 0;
    while (remaining > 1e-9 && lots.length) {
      const lot = lots[0];
      const take = Math.min(lot.qty, remaining);
      qty += take;
      cost += take * lot.price;
      timeWeighted += take * lot.time;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 1e-9) lots.shift();
    }
    if (qty <= 1e-9) continue;
    const entryPrice = cost / qty;
    const entryTime = timeWeighted / qty;
    const pnl = qty * f.price - cost;
    out.push({
      entryTime,
      exitTime: f.time,
      qty,
      entryPrice,
      exitPrice: f.price,
      pnl,
      returnPct: (f.price / entryPrice - 1) * 100,
      holdingMs: f.time - entryTime,
      exitHash: f.hash,
    });
  }
  return out;
}

/** Remaining unmatched buys (open positions) after FIFO matching. */
export function openLots(fills: DexFill[], quote: string): { qty: number; avgPrice: number } | null {
  let qty = 0;
  let cost = 0;
  const lots: { qty: number; price: number }[] = [];
  for (const f of fills) {
    if (f.quote !== quote) continue;
    if (f.side === "BUY") lots.push({ qty: f.xrp, price: f.price });
    else {
      let r = f.xrp;
      while (r > 1e-9 && lots.length) {
        const t = Math.min(lots[0].qty, r);
        lots[0].qty -= t;
        r -= t;
        if (lots[0].qty <= 1e-9) lots.shift();
      }
    }
  }
  for (const l of lots) {
    qty += l.qty;
    cost += l.qty * l.price;
  }
  return qty > 1e-9 ? { qty, avgPrice: cost / qty } : null;
}
