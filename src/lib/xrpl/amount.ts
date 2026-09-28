import Decimal from "decimal.js";
import { decodeCurrency } from "./address";
import type { TxMeta, XrplAmount, XrplTx } from "./types";

/** Flag bit for partial payments (Payment.tfPartialPayment). */
export const TF_PARTIAL_PAYMENT = 0x00020000;

export interface ParsedAmount {
  kind: "XRP" | "IOU" | "MPT";
  /** Human-readable currency (XRP, USD, RLUSD, "LP Token", or MPT id prefix). */
  currency: string;
  /** Raw currency code (3-char or 40-hex) — for IOUs. */
  currencyCode?: string;
  issuer?: string;
  mptIssuanceId?: string;
  /** Decimal string in whole units (XRP, not drops). */
  value: string;
  /** Float convenience (display/aggregation only; never for ledgers of record). */
  num: number;
}

/** Drops (integer string) → XRP decimal string, exact. */
export function dropsToXrpString(drops: string | number): string {
  return new Decimal(String(drops)).div(1_000_000).toFixed();
}

export function parseAmount(a: unknown): ParsedAmount | null {
  if (a === null || a === undefined) return null;
  if (typeof a === "string") {
    if (!/^-?\d+$/.test(a)) return null;
    const value = dropsToXrpString(a);
    return { kind: "XRP", currency: "XRP", value, num: Number(value) };
  }
  if (typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (typeof o.mpt_issuance_id === "string" && typeof o.value === "string") {
      return {
        kind: "MPT",
        currency: `MPT ${o.mpt_issuance_id.slice(0, 8)}…`,
        mptIssuanceId: o.mpt_issuance_id,
        value: o.value,
        num: Number(o.value),
      };
    }
    if (typeof o.currency === "string" && typeof o.value === "string") {
      if (o.currency === "XRP" && !o.issuer) {
        // Some APIs return XRP as {currency:"XRP", value:"1.5"} in XRP units
        return { kind: "XRP", currency: "XRP", value: new Decimal(o.value).toFixed(), num: Number(o.value) };
      }
      return {
        kind: "IOU",
        currency: displayCurrency(o.currency),
        currencyCode: o.currency,
        issuer: typeof o.issuer === "string" ? o.issuer : undefined,
        value: new Decimal(o.value).toFixed(),
        num: Number(o.value),
      };
    }
  }
  return null;
}

/** LP tokens use a 40-hex currency code starting with 0x03. */
export function isLpTokenCode(code: string | undefined): boolean {
  return !!code && /^03[0-9A-F]{38}$/i.test(code);
}

export function displayCurrency(code: string): string {
  if (isLpTokenCode(code)) return "LP Token";
  return decodeCurrency(code);
}

/** Stable key for an asset: "XRP" | "USD.rIssuer" | "MPT:<id>" */
export function assetKey(a: Pick<ParsedAmount, "kind" | "currencyCode" | "issuer" | "mptIssuanceId" | "currency">): string {
  if (a.kind === "XRP") return "XRP";
  if (a.kind === "MPT") return `MPT:${a.mptIssuanceId}`;
  return `${a.currencyCode ?? a.currency}.${a.issuer ?? ""}`;
}

export type DeliveredSource = "meta.delivered_amount" | "meta.DeliveredAmount" | "Amount (not a partial payment)" | "unavailable" | "not applicable";

/**
 * Actually-delivered amount of a transaction.
 * Uses meta.delivered_amount (authoritative) — NEVER trusts `Amount` for partial payments,
 * which can deliver far less than the stated Amount.
 */
export function deliveredAmount(tx: XrplTx, meta: TxMeta | null | undefined): { amount: ParsedAmount | null; source: DeliveredSource } {
  if (meta && meta.TransactionResult && !meta.TransactionResult.startsWith("tes")) return { amount: null, source: "not applicable" };
  const d = meta?.delivered_amount;
  if (d !== undefined && d !== "unavailable") {
    const p = parseAmount(d);
    if (p) return { amount: p, source: "meta.delivered_amount" };
  }
  if (meta?.DeliveredAmount !== undefined) {
    const p = parseAmount(meta.DeliveredAmount);
    if (p) return { amount: p, source: "meta.DeliveredAmount" };
  }
  if (tx.TransactionType !== "Payment") return { amount: null, source: d === "unavailable" ? "unavailable" : "not applicable" };
  const partial = ((tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0;
  if (partial || d === "unavailable") return { amount: null, source: "unavailable" };
  // Non-partial payments deliver exactly Amount (API v2 name: DeliverMax) when successful.
  const p = parseAmount(tx.Amount ?? tx.DeliverMax);
  return p ? { amount: p, source: "Amount (not a partial payment)" } : { amount: null, source: "unavailable" };
}

/** The stated (maximum) amount of a payment — v1 `Amount` or v2 `DeliverMax`. */
export function statedAmount(tx: XrplTx): ParsedAmount | null {
  return parseAmount(tx.Amount ?? tx.DeliverMax);
}

export function isPartialPayment(tx: XrplTx): boolean {
  return tx.TransactionType === "Payment" && ((tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0;
}

export function formatAmount(a: ParsedAmount | null | undefined, maxDp = 6): string {
  if (!a) return "—";
  const d = new Decimal(a.value);
  const abs = d.abs();
  const dp = abs.gte(1000) ? 2 : abs.gte(1) ? Math.min(4, maxDp) : maxDp;
  const s = Number(d.toDecimalPlaces(dp).toFixed(dp)).toLocaleString("en-US", { maximumFractionDigits: dp });
  return `${s} ${a.currency}`;
}

/** Fee in drops → XRP number. */
export function feeXrp(tx: XrplTx): number {
  return tx.Fee ? Number(dropsToXrpString(tx.Fee)) : 0;
}

export type { XrplAmount };
