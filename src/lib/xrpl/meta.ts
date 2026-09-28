import Decimal from "decimal.js";
import { displayCurrency } from "./amount";
import type { AffectedNode, Json, LedgerNodeBody, TxMeta } from "./types";

/**
 * Balance-change extraction from transaction metadata (AffectedNodes).
 * Mirrors the well-known algorithm used by xrpl.js `getBalanceChanges`:
 *  - AccountRoot.Balance (drops) → XRP change for that account (includes the fee for the sender)
 *  - RippleState.Balance → token change; the balance is stored from the LOW account's perspective,
 *    so the low account gets +Δ (counterparty = high account) and the high account gets −Δ.
 */

export interface BalanceChange {
  account: string;
  currency: string; // "XRP" or display currency
  currencyCode?: string; // raw code for tokens
  /** For tokens: the counterparty on the trust line (usually the issuer). */
  issuer?: string;
  /** Decimal string, in whole units (XRP, not drops). */
  value: string;
}

type NodeKind = "CreatedNode" | "ModifiedNode" | "DeletedNode";

export function unwrapNode(n: AffectedNode): { kind: NodeKind; node: LedgerNodeBody } | null {
  if (n.CreatedNode) return { kind: "CreatedNode", node: n.CreatedNode };
  if (n.ModifiedNode) return { kind: "ModifiedNode", node: n.ModifiedNode };
  if (n.DeletedNode) return { kind: "DeletedNode", node: n.DeletedNode };
  return null;
}

function balanceValue(b: unknown): Decimal | null {
  if (typeof b === "string" && /^-?\d+$/.test(b)) return new Decimal(b);
  if (b && typeof b === "object" && typeof (b as Json).value === "string") return new Decimal((b as Json).value as string);
  return null;
}

/** Returns [final, previous] balance fields for a node, or null if the balance did not change. */
function balanceDelta(kind: NodeKind, node: LedgerNodeBody): { final: unknown; delta: Decimal } | null {
  if (kind === "CreatedNode") {
    const nb = node.NewFields?.Balance;
    const v = balanceValue(nb);
    return v ? { final: nb, delta: v } : null;
  }
  const prevB = node.PreviousFields?.Balance;
  if (prevB === undefined) return null; // unchanged
  const finB = node.FinalFields?.Balance;
  const f = balanceValue(finB) ?? new Decimal(0);
  const p = balanceValue(prevB);
  if (!p) return null;
  return { final: finB, delta: f.minus(p) };
}

export function extractBalanceChanges(meta: TxMeta | null | undefined): BalanceChange[] {
  if (!meta || !Array.isArray(meta.AffectedNodes)) return [];
  const out: BalanceChange[] = [];
  for (const raw of meta.AffectedNodes) {
    const u = unwrapNode(raw);
    if (!u) continue;
    const { kind, node } = u;
    if (node.LedgerEntryType === "AccountRoot") {
      const d = balanceDelta(kind, node);
      if (!d || d.delta.isZero()) continue;
      const fields = (node.FinalFields ?? node.NewFields ?? {}) as Json;
      const account = String(fields.Account ?? "");
      if (!account) continue;
      out.push({ account, currency: "XRP", value: d.delta.div(1_000_000).toFixed() });
    } else if (node.LedgerEntryType === "RippleState") {
      const d = balanceDelta(kind, node);
      if (!d || d.delta.isZero()) continue;
      const fields = (node.FinalFields ?? node.NewFields ?? {}) as Json;
      const low = (fields.LowLimit as Json | undefined)?.issuer as string | undefined;
      const high = (fields.HighLimit as Json | undefined)?.issuer as string | undefined;
      const code = ((fields.Balance as Json | undefined)?.currency as string | undefined) ?? "";
      if (!low || !high || !code) continue;
      const currency = displayCurrency(code);
      out.push({ account: low, currency, currencyCode: code, issuer: high, value: d.delta.toFixed() });
      out.push({ account: high, currency, currencyCode: code, issuer: low, value: d.delta.neg().toFixed() });
    }
  }
  return out;
}

/** Balance changes for a single account. */
export function accountBalanceChanges(meta: TxMeta | null | undefined, account: string): BalanceChange[] {
  return extractBalanceChanges(meta).filter((c) => c.account === account);
}

/** XRP change (whole XRP) for an account in this tx, including fee. 0 if unchanged. */
export function xrpChangeFor(meta: TxMeta | null | undefined, account: string): Decimal {
  return accountBalanceChanges(meta, account)
    .filter((c) => c.currency === "XRP")
    .reduce((s, c) => s.plus(c.value), new Decimal(0));
}

/** Final XRP balance of an account after this tx, if the tx touched its AccountRoot balance. */
export function finalXrpBalanceFor(meta: TxMeta | null | undefined, account: string): Decimal | null {
  if (!meta) return null;
  for (const raw of meta.AffectedNodes) {
    const u = unwrapNode(raw);
    if (!u || u.node.LedgerEntryType !== "AccountRoot") continue;
    const fields = (u.node.FinalFields ?? u.node.NewFields ?? {}) as Json;
    if (fields.Account !== account) continue;
    if (u.kind === "ModifiedNode" && u.node.PreviousFields?.Balance === undefined) return null;
    const b = balanceValue(fields.Balance);
    return b ? b.div(1_000_000) : null;
  }
  return null;
}

/** Accounts created by this tx (CreatedNode AccountRoot) — the only reliable "new account" signal. */
export function createdAccounts(meta: TxMeta | null | undefined): string[] {
  if (!meta) return [];
  const out: string[] = [];
  for (const raw of meta.AffectedNodes) {
    const n = raw.CreatedNode;
    if (n?.LedgerEntryType === "AccountRoot" && typeof n.NewFields?.Account === "string") out.push(n.NewFields.Account as string);
  }
  return out;
}

/** Number of DEX offers consumed (fully or partially) by this tx. */
export function consumedOffers(meta: TxMeta | null | undefined, txAccount: string): number {
  if (!meta) return 0;
  let n = 0;
  for (const raw of meta.AffectedNodes) {
    const u = unwrapNode(raw);
    if (!u || u.node.LedgerEntryType !== "Offer" || u.kind === "CreatedNode") continue;
    const prev = u.node.PreviousFields;
    const owner = (u.node.FinalFields?.Account as string | undefined) ?? "";
    // A consumed offer has its TakerPays/TakerGets reduced. Offers cancelled by their owner have no PreviousFields.
    if (prev && (prev.TakerPays !== undefined || prev.TakerGets !== undefined) && owner !== txAccount) n++;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* Human summary of affected objects                                           */
/* -------------------------------------------------------------------------- */

export interface AffectedSummary {
  kind: NodeKind;
  entryType: string;
  ledgerIndex: string;
  /** Owner / main account of the object when known */
  account?: string;
  title: string;
  changes: { field: string; before?: string; after?: string; delta?: string }[];
}

function fmtField(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  const o = v as Json;
  if (typeof o.value === "string" && typeof o.currency === "string") return `${o.value} ${displayCurrency(o.currency)}${o.issuer ? ` (${String(o.issuer).slice(0, 8)}…)` : ""}`;
  return JSON.stringify(v);
}

export function summarizeAffectedNodes(meta: TxMeta | null | undefined): AffectedSummary[] {
  if (!meta) return [];
  return meta.AffectedNodes.flatMap((raw) => {
    const u = unwrapNode(raw);
    if (!u) return [];
    const { kind, node } = u;
    const fields = (node.FinalFields ?? node.NewFields ?? {}) as Json;
    const prev = (node.PreviousFields ?? {}) as Json;
    const changes: AffectedSummary["changes"] = [];
    let title: string = node.LedgerEntryType;
    let account: string | undefined = typeof fields.Account === "string" ? fields.Account : undefined;

    if (node.LedgerEntryType === "AccountRoot") {
      title = "Account";
      const d = balanceDelta(kind, node);
      if (d) {
        const before = kind === "CreatedNode" ? "0" : new Decimal(String(prev.Balance)).div(1e6).toFixed();
        const after = balanceValue(d.final)?.div(1e6).toFixed() ?? "0";
        changes.push({ field: "Balance (XRP)", before, after, delta: d.delta.div(1e6).toFixed() });
      }
    } else if (node.LedgerEntryType === "RippleState") {
      const low = (fields.LowLimit as Json | undefined)?.issuer as string | undefined;
      const high = (fields.HighLimit as Json | undefined)?.issuer as string | undefined;
      const code = ((fields.Balance as Json | undefined)?.currency as string | undefined) ?? "";
      title = `Trust line ${displayCurrency(code)}`;
      account = low;
      const d = balanceDelta(kind, node);
      if (d) {
        changes.push({
          field: `Balance (low: ${low?.slice(0, 8)}…, high: ${high?.slice(0, 8)}…)`,
          before: kind === "CreatedNode" ? "0" : balanceValue(prev.Balance)?.toFixed(),
          after: balanceValue(d.final)?.toFixed() ?? "0",
          delta: d.delta.toFixed(),
        });
      }
    } else if (node.LedgerEntryType === "Offer") {
      title = "DEX offer";
    }
    // Generic field diffs for everything else (skip noisy bookkeeping fields)
    const skip = new Set(["Balance", "PreviousTxnID", "PreviousTxnLgrSeq", "OwnerNode", "BookNode", "Flags"]);
    for (const k of Object.keys(prev)) {
      if (skip.has(k)) continue;
      changes.push({ field: k, before: fmtField(prev[k]), after: fmtField(fields[k]) });
    }
    return [{ kind, entryType: node.LedgerEntryType, ledgerIndex: node.LedgerIndex, account, title, changes }];
  });
}
