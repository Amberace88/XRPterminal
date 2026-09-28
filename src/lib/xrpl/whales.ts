import { deliveredAmount } from "./amount";
import { isExchangeLabel, primaryLabel, type LabelIndex, type WalletLabel } from "./labels";
import type { TxEnvelope } from "./types";

/** Selectable whale thresholds (XRP). Default 1M. */
export const WHALE_THRESHOLDS = [100_000, 500_000, 1_000_000, 10_000_000] as const;
export const DEFAULT_WHALE_THRESHOLD = 1_000_000;
/** Smallest threshold — the stream buffer keeps everything above this so users can switch thresholds. */
export const WHALE_BUFFER_MIN = WHALE_THRESHOLDS[0];

export const WHALE_DISCLAIMER =
  "Large transfer ≠ buy or sell. Exchange transfers can have many explanations (internal wallet management, custody, OTC).";
export const FLOW_DISCLAIMER = "Exchange flow is not equivalent to market direction.";

export interface WhalePayment {
  hash: string;
  from: string;
  to: string;
  amountXrp: number;
  ledgerIndex: number | null;
  timeMs: number | null;
  /** When the stream message was received locally (fallback clock). */
  observedAt: number;
  destinationTag?: number;
  sourceTag?: number;
}

/**
 * Extract an XRP payment that actually delivered ≥ minXrp.
 * Uses meta.delivered_amount — a partial payment's `Amount` is ignored.
 */
export function toWhalePayment(env: TxEnvelope, minXrp: number, observedAt = Date.now()): WhalePayment | null {
  if (env.tx.TransactionType !== "Payment") return null;
  if (env.meta?.TransactionResult !== "tesSUCCESS") return null;
  if (!env.tx.Destination) return null;
  const { amount } = deliveredAmount(env.tx, env.meta);
  if (!amount || amount.kind !== "XRP") return null;
  if (!(amount.num >= minXrp)) return null;
  return {
    hash: env.hash,
    from: env.tx.Account,
    to: env.tx.Destination,
    amountXrp: amount.num,
    ledgerIndex: env.ledgerIndex,
    timeMs: env.closeTimeMs,
    observedAt,
    destinationTag: env.tx.DestinationTag,
    sourceTag: env.tx.SourceTag,
  };
}

export function filterWhales(list: WhalePayment[], threshold: number): WhalePayment[] {
  return list.filter((w) => w.amountXrp >= threshold);
}

export type FlowKind = "inflow" | "outflow" | "exchange-to-exchange" | "internal";

export interface ExchangeFlow {
  kind: FlowKind;
  exchange: string;
  fromLabel: WalletLabel | null;
  toLabel: WalletLabel | null;
}

/**
 * Classify an exchange flow ONLY when a side carries an EXCHANGE label with external provenance.
 * Unlabelled wallets are never assumed to be exchanges.
 */
export function classifyExchangeFlow(p: Pick<WhalePayment, "from" | "to">, labels: LabelIndex | null | undefined): ExchangeFlow | null {
  const exL = (a: string) => labels?.get(a)?.find(isExchangeLabel) ?? primaryLabel(labels, a);
  const fromL = exL(p.from);
  const toL = exL(p.to);
  const fromEx = isExchangeLabel(fromL);
  const toEx = isExchangeLabel(toL);
  if (!fromEx && !toEx) return null;
  const brand = (l: WalletLabel | null) => (l?.name ?? "").split(/[ (#]/)[0].toLowerCase();
  if (fromEx && toEx) {
    const same = brand(fromL) === brand(toL);
    return { kind: same ? "internal" : "exchange-to-exchange", exchange: fromL!.name, fromLabel: fromL, toLabel: toL };
  }
  if (toEx) return { kind: "inflow", exchange: toL!.name, fromLabel: fromL, toLabel: toL };
  return { kind: "outflow", exchange: fromL!.name, fromLabel: fromL, toLabel: toL };
}

export interface FlowTotals {
  inflowXrp: number;
  outflowXrp: number;
  netXrp: number; // inflow - outflow (positive = more XRP moved INTO labelled exchanges)
  inflowCount: number;
  outflowCount: number;
  interExchangeXrp: number;
  byExchange: { exchange: string; inflowXrp: number; outflowXrp: number }[];
}

export function exchangeFlowTotals(list: WhalePayment[], labels: LabelIndex | null | undefined): FlowTotals {
  const t: FlowTotals = { inflowXrp: 0, outflowXrp: 0, netXrp: 0, inflowCount: 0, outflowCount: 0, interExchangeXrp: 0, byExchange: [] };
  const by = new Map<string, { exchange: string; inflowXrp: number; outflowXrp: number }>();
  for (const p of list) {
    const f = classifyExchangeFlow(p, labels);
    if (!f) continue;
    const key = f.exchange.split(/[ (#]/)[0];
    const e = by.get(key) ?? { exchange: key, inflowXrp: 0, outflowXrp: 0 };
    if (f.kind === "inflow") {
      t.inflowXrp += p.amountXrp;
      t.inflowCount++;
      e.inflowXrp += p.amountXrp;
    } else if (f.kind === "outflow") {
      t.outflowXrp += p.amountXrp;
      t.outflowCount++;
      e.outflowXrp += p.amountXrp;
    } else t.interExchangeXrp += p.amountXrp;
    by.set(key, e);
  }
  t.netXrp = t.inflowXrp - t.outflowXrp;
  t.byExchange = [...by.values()].sort((a, b) => b.inflowXrp + b.outflowXrp - (a.inflowXrp + a.outflowXrp));
  return t;
}
