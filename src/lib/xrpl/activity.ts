import { rippleTimeToMs } from "@/lib/format";
import { deliveredAmount, dropsToXrpString } from "./amount";
import { consumedOffers, createdAccounts } from "./meta";
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "./rlusd";
import type { LedgerClosedMsg, TxEnvelope } from "./types";

/**
 * Per-ledger network activity aggregated from the live `transactions` + `ledger` streams.
 * Pure data structure — no fabrication, no backfill: only ledgers observed in this session.
 */
export interface LedgerStat {
  ledgerIndex: number;
  /** From ledgerClosed (authoritative count of txs in the ledger) */
  txnCount: number | null;
  closeTimeMs: number | null;
  feeBaseDrops: number | null;
  reserveBaseDrops: number | null;
  reserveIncDrops: number | null;
  /** From the transaction stream */
  observedTx: number;
  types: Record<string, number>;
  failed: number;
  feesDrops: number;
  newAccounts: number;
  xrpPayments: number;
  xrpPaymentVolume: number;
  tokenPayments: number;
  offerCreates: number;
  offerCancels: number;
  dexFills: number;
  trustSets: number;
  ammTx: number;
  nftTx: number;
  rlusdPayments: number;
  rlusdVolume: number;
  accounts: string[];
}

export function emptyLedgerStat(ledgerIndex: number): LedgerStat {
  return {
    ledgerIndex,
    txnCount: null,
    closeTimeMs: null,
    feeBaseDrops: null,
    reserveBaseDrops: null,
    reserveIncDrops: null,
    observedTx: 0,
    types: {},
    failed: 0,
    feesDrops: 0,
    newAccounts: 0,
    xrpPayments: 0,
    xrpPaymentVolume: 0,
    tokenPayments: 0,
    offerCreates: 0,
    offerCancels: 0,
    dexFills: 0,
    trustSets: 0,
    ammTx: 0,
    nftTx: 0,
    rlusdPayments: 0,
    rlusdVolume: 0,
    accounts: [],
  };
}

/** Mutates `s` with one validated transaction. */
export function applyTx(s: LedgerStat, env: TxEnvelope): void {
  const t = env.tx.TransactionType;
  s.observedTx++;
  s.types[t] = (s.types[t] ?? 0) + 1;
  if (env.tx.Fee && /^\d+$/.test(env.tx.Fee)) s.feesDrops += Number(env.tx.Fee);
  if (!s.accounts.includes(env.tx.Account)) s.accounts.push(env.tx.Account);
  if (env.closeTimeMs && !s.closeTimeMs) s.closeTimeMs = env.closeTimeMs;
  const ok = env.meta?.TransactionResult === "tesSUCCESS";
  if (!ok) {
    s.failed++;
    return;
  }
  s.newAccounts += createdAccounts(env.meta).length;
  s.dexFills += consumedOffers(env.meta, env.tx.Account);
  if (t === "Payment") {
    const { amount } = deliveredAmount(env.tx, env.meta);
    if (amount?.kind === "XRP") {
      s.xrpPayments++;
      s.xrpPaymentVolume += amount.num;
    } else if (amount) {
      s.tokenPayments++;
      if (amount.currencyCode === RLUSD_CURRENCY_HEX && amount.issuer === RLUSD_ISSUER) {
        s.rlusdPayments++;
        s.rlusdVolume += amount.num;
      }
    }
  } else if (t === "OfferCreate") s.offerCreates++;
  else if (t === "OfferCancel") s.offerCancels++;
  else if (t === "TrustSet") s.trustSets++;
  if (t.startsWith("AMM")) s.ammTx++;
  if (t.startsWith("NFToken")) s.nftTx++;
}

export function applyLedgerClosed(s: LedgerStat, m: LedgerClosedMsg): void {
  s.txnCount = typeof m.txn_count === "number" ? m.txn_count : s.txnCount;
  s.closeTimeMs = typeof m.ledger_time === "number" ? rippleTimeToMs(m.ledger_time) : s.closeTimeMs;
  s.feeBaseDrops = m.fee_base ?? s.feeBaseDrops;
  s.reserveBaseDrops = m.reserve_base ?? s.reserveBaseDrops;
  s.reserveIncDrops = m.reserve_inc ?? s.reserveIncDrops;
}

export interface ActivityTotals {
  ledgers: number;
  tx: number;
  failed: number;
  feesXrp: number;
  newAccounts: number;
  activeAccounts: number;
  xrpPayments: number;
  xrpPaymentVolume: number;
  tokenPayments: number;
  offerCreates: number;
  offerCancels: number;
  dexFills: number;
  trustSets: number;
  ammTx: number;
  nftTx: number;
  rlusdPayments: number;
  rlusdVolume: number;
  types: Record<string, number>;
  spanMs: number | null;
  txPerSecond: number | null;
}

export function sumActivity(stats: LedgerStat[]): ActivityTotals {
  const t: ActivityTotals = {
    ledgers: stats.length,
    tx: 0,
    failed: 0,
    feesXrp: 0,
    newAccounts: 0,
    activeAccounts: 0,
    xrpPayments: 0,
    xrpPaymentVolume: 0,
    tokenPayments: 0,
    offerCreates: 0,
    offerCancels: 0,
    dexFills: 0,
    trustSets: 0,
    ammTx: 0,
    nftTx: 0,
    rlusdPayments: 0,
    rlusdVolume: 0,
    types: {},
    spanMs: null,
    txPerSecond: null,
  };
  const accts = new Set<string>();
  let feesDrops = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const s of stats) {
    t.tx += s.observedTx;
    t.failed += s.failed;
    feesDrops += s.feesDrops;
    t.newAccounts += s.newAccounts;
    t.xrpPayments += s.xrpPayments;
    t.xrpPaymentVolume += s.xrpPaymentVolume;
    t.tokenPayments += s.tokenPayments;
    t.offerCreates += s.offerCreates;
    t.offerCancels += s.offerCancels;
    t.dexFills += s.dexFills;
    t.trustSets += s.trustSets;
    t.ammTx += s.ammTx;
    t.nftTx += s.nftTx;
    t.rlusdPayments += s.rlusdPayments;
    t.rlusdVolume += s.rlusdVolume;
    for (const [k, v] of Object.entries(s.types)) t.types[k] = (t.types[k] ?? 0) + v;
    for (const a of s.accounts) accts.add(a);
    if (s.closeTimeMs) {
      minT = Math.min(minT, s.closeTimeMs);
      maxT = Math.max(maxT, s.closeTimeMs);
    }
  }
  t.feesXrp = Number(dropsToXrpString(feesDrops));
  t.activeAccounts = accts.size;
  if (Number.isFinite(minT) && maxT > minT) {
    t.spanMs = maxT - minT;
    t.txPerSecond = t.tx / (t.spanMs / 1000);
  }
  return t;
}

/** Group transaction types into display buckets for the breakdown chart. */
export function typeBuckets(types: Record<string, number>): { type: string; count: number }[] {
  const b = new Map<string, number>();
  for (const [k, v] of Object.entries(types)) {
    const key = k.startsWith("AMM") ? "AMM*" : k.startsWith("NFToken") ? "NFToken*" : k.startsWith("Escrow") ? "Escrow*" : k.startsWith("PaymentChannel") ? "PaymentChannel*" : k.startsWith("Check") ? "Check*" : k;
    b.set(key, (b.get(key) ?? 0) + v);
  }
  return [...b.entries()].map(([type, count]) => ({ type, count })).sort((a, b2) => b2.count - a.count);
}
