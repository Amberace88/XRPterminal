import Decimal from "decimal.js";
import { deliveredAmount, feeXrp, type ParsedAmount } from "./amount";
import { accountBalanceChanges, finalXrpBalanceFor } from "./meta";
import type { TxEnvelope } from "./types";

/**
 * Wallet analytics computed ONLY from the fetched transaction window (spec §28, §185, §186).
 * Every consumer must label results "within the last N transactions".
 */

export type TimelineCategory = "payment" | "offer" | "trustline" | "token" | "large";

export interface TimelineItem {
  hash: string;
  type: string;
  timeMs: number | null;
  ledgerIndex: number | null;
  result: string;
  direction: "in" | "out" | "self" | "other";
  counterparty: string | null;
  amount: ParsedAmount | null;
  feeXrp: number;
  /** XRP balance change for the viewed account (incl. fee), whole XRP */
  xrpDelta: number;
  categories: TimelineCategory[];
  destinationTag?: number;
}

export const DEFAULT_LARGE_TRANSFER_XRP = 100_000;

export function toTimelineItem(env: TxEnvelope, account: string, largeXrp = DEFAULT_LARGE_TRANSFER_XRP): TimelineItem {
  const t = env.tx.TransactionType;
  const result = env.meta?.TransactionResult ?? "unknown";
  const { amount } = deliveredAmount(env.tx, env.meta);
  const isSender = env.tx.Account === account;
  const dest = env.tx.Destination;
  let direction: TimelineItem["direction"] = "other";
  let counterparty: string | null = null;
  if (dest) {
    if (isSender && dest === account) direction = "self";
    else if (isSender) {
      direction = "out";
      counterparty = dest;
    } else if (dest === account) {
      direction = "in";
      counterparty = env.tx.Account;
    }
  } else if (isSender) direction = "out";
  else counterparty = env.tx.Account;

  const changes = accountBalanceChanges(env.meta, account);
  const xrpDelta = changes.filter((c) => c.currency === "XRP").reduce((s, c) => s + Number(c.value), 0);
  const tokenTouched = changes.some((c) => c.currency !== "XRP");

  const cats: TimelineCategory[] = [];
  if (t === "Payment") cats.push("payment");
  if (t === "OfferCreate" || t === "OfferCancel") cats.push("offer");
  if (t === "TrustSet") cats.push("trustline");
  const involvesToken =
    tokenTouched ||
    t === "TrustSet" ||
    t.startsWith("AMM") ||
    t === "Clawback" ||
    (amount !== null && amount.kind !== "XRP") ||
    (t === "OfferCreate" && (typeof env.tx.TakerGets === "object" || typeof env.tx.TakerPays === "object"));
  if (involvesToken) cats.push("token");
  if (amount?.kind === "XRP" && amount.num >= largeXrp && t === "Payment") cats.push("large");

  return {
    hash: env.hash,
    type: t,
    timeMs: env.closeTimeMs,
    ledgerIndex: env.ledgerIndex,
    result,
    direction,
    counterparty,
    amount: t === "Payment" || t === "CheckCash" || t === "AccountDelete" ? amount : null,
    feeXrp: isSender ? feeXrp(env.tx) : 0,
    xrpDelta,
    categories: cats,
    destinationTag: env.tx.DestinationTag,
  };
}

export function filterTimeline(items: TimelineItem[], filter: TimelineCategory | "all"): TimelineItem[] {
  return filter === "all" ? items : items.filter((i) => i.categories.includes(filter));
}

/* ------------------------------ Counterparties ------------------------------ */

export interface Counterparty {
  address: string;
  count: number;
  inCount: number;
  outCount: number;
  inXrp: number;
  outXrp: number;
  volumeXrp: number;
  tokenPayments: number;
  lastTimeMs: number | null;
}

export function counterparties(envs: TxEnvelope[], account: string): Counterparty[] {
  const m = new Map<string, Counterparty>();
  for (const env of envs) {
    if (env.tx.TransactionType !== "Payment" || env.meta?.TransactionResult !== "tesSUCCESS") continue;
    const dest = env.tx.Destination;
    if (!dest) continue;
    let cp: string | null = null;
    let dir: "in" | "out" | null = null;
    if (env.tx.Account === account && dest !== account) {
      cp = dest;
      dir = "out";
    } else if (dest === account && env.tx.Account !== account) {
      cp = env.tx.Account;
      dir = "in";
    }
    if (!cp || !dir) continue;
    const c = m.get(cp) ?? { address: cp, count: 0, inCount: 0, outCount: 0, inXrp: 0, outXrp: 0, volumeXrp: 0, tokenPayments: 0, lastTimeMs: null };
    c.count++;
    const { amount } = deliveredAmount(env.tx, env.meta);
    if (dir === "in") c.inCount++;
    else c.outCount++;
    if (amount?.kind === "XRP") {
      if (dir === "in") c.inXrp += amount.num;
      else c.outXrp += amount.num;
      c.volumeXrp += amount.num;
    } else if (amount) c.tokenPayments++;
    if (env.closeTimeMs && (!c.lastTimeMs || env.closeTimeMs > c.lastTimeMs)) c.lastTimeMs = env.closeTimeMs;
    m.set(cp, c);
  }
  return [...m.values()];
}

/* ----------------------------- Payment summary ------------------------------ */

export interface PaymentSummary {
  inCount: number;
  outCount: number;
  inXrp: number;
  outXrp: number;
  netXrp: number;
  tokenIn: number;
  tokenOut: number;
  largestInXrp: number;
  largestOutXrp: number;
  feesPaidXrp: number;
}

export function paymentSummary(envs: TxEnvelope[], account: string): PaymentSummary {
  const s: PaymentSummary = { inCount: 0, outCount: 0, inXrp: 0, outXrp: 0, netXrp: 0, tokenIn: 0, tokenOut: 0, largestInXrp: 0, largestOutXrp: 0, feesPaidXrp: 0 };
  for (const env of envs) {
    if (env.tx.Account === account) s.feesPaidXrp += feeXrp(env.tx);
    if (env.tx.TransactionType !== "Payment" || env.meta?.TransactionResult !== "tesSUCCESS") continue;
    const dest = env.tx.Destination;
    if (!dest || (env.tx.Account === account && dest === account)) continue;
    const { amount } = deliveredAmount(env.tx, env.meta);
    if (!amount) continue;
    const incoming = dest === account;
    const outgoing = env.tx.Account === account;
    if (amount.kind === "XRP") {
      if (incoming) {
        s.inCount++;
        s.inXrp += amount.num;
        s.largestInXrp = Math.max(s.largestInXrp, amount.num);
      } else if (outgoing) {
        s.outCount++;
        s.outXrp += amount.num;
        s.largestOutXrp = Math.max(s.largestOutXrp, amount.num);
      }
    } else {
      if (incoming) s.tokenIn++;
      else if (outgoing) s.tokenOut++;
    }
  }
  s.netXrp = s.inXrp - s.outXrp;
  return s;
}

/* ------------------------------ Activity pattern ----------------------------- */

export function txPerDay(envs: TxEnvelope[]): { day: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of envs) {
    if (!e.closeTimeMs) continue;
    const d = new Date(e.closeTimeMs).toISOString().slice(0, 10);
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  if (!m.size) return [];
  // fill gaps between first and last day so the histogram is honest about idle days
  const days = [...m.keys()].sort();
  const out: { day: string; count: number }[] = [];
  const start = Date.parse(days[0] + "T00:00:00Z");
  const end = Date.parse(days[days.length - 1] + "T00:00:00Z");
  const span = Math.round((end - start) / 86_400_000);
  if (span > 400) return days.map((d) => ({ day: d, count: m.get(d)! }));
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.push({ day: d, count: m.get(d) ?? 0 });
  }
  return out;
}

/** Max number of transactions in any sliding window of `windowMs`. */
export function maxBurst(envs: TxEnvelope[], windowMs = 3_600_000): number {
  const ts = envs.map((e) => e.closeTimeMs).filter((t): t is number => t !== null).sort((a, b) => a - b);
  let best = 0;
  let j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > windowMs) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

/* ------------------------ Balance history reconstruction --------------------- */

export interface BalancePoint {
  timeMs: number;
  ledgerIndex: number | null;
  hash: string;
  /** Balance AFTER this transaction */
  balance: number;
}

/**
 * Reconstruct an asset's balance over the fetched window by walking BACK from the current balance,
 * subtracting each transaction's balance change (from metadata). For XRP, a transaction's
 * AccountRoot FinalFields.Balance (exact post-tx balance) re-anchors the walk when available.
 *
 * `envs` may be in any order; they are sorted newest → oldest. Returns points oldest → newest,
 * plus the reconstructed balance before the oldest fetched transaction.
 */
export function reconstructBalanceHistory(
  envs: TxEnvelope[],
  account: string,
  currentBalance: string | number,
  asset: { currency: "XRP" } | { currencyCode: string; issuer: string } = { currency: "XRP" },
): { points: BalancePoint[]; startBalance: number; txCount: number } {
  const sorted = [...envs]
    .filter((e) => e.ledgerIndex !== null || e.closeTimeMs !== null)
    .sort((a, b) => (b.ledgerIndex ?? 0) - (a.ledgerIndex ?? 0) || (b.meta?.TransactionIndex ?? 0) - (a.meta?.TransactionIndex ?? 0));
  let running = new Decimal(String(currentBalance));
  const isXrp = "currency" in asset;
  const pts: BalancePoint[] = [];
  for (const e of sorted) {
    const changes = accountBalanceChanges(e.meta, account).filter((c) =>
      isXrp ? c.currency === "XRP" : c.currencyCode === asset.currencyCode && c.issuer === asset.issuer,
    );
    const delta = changes.reduce((s, c) => s.plus(c.value), new Decimal(0));
    if (isXrp) {
      const exact = finalXrpBalanceFor(e.meta, account);
      if (exact) running = exact;
    }
    if (e.closeTimeMs !== null) pts.push({ timeMs: e.closeTimeMs, ledgerIndex: e.ledgerIndex, hash: e.hash, balance: running.toNumber() });
    running = running.minus(delta);
  }
  return { points: pts.reverse(), startBalance: running.toNumber(), txCount: sorted.length };
}
