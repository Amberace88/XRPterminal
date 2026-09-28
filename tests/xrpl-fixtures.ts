/**
 * Test-only fixtures shaped like real rippled responses. NOT used by the app.
 * Addresses are valid XRPL test/genesis-style addresses; hashes are synthetic.
 */
import type { TxEnvelope, TxMeta, XrplTx } from "@/lib/xrpl/types";

export const A = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"; // genesis account
export const B = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
export const C = "rrrrrrrrrrrrrrrrrrrrrhoLvTp"; // ACCOUNT_ZERO
export const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
export const RLUSD = "524C555344000000000000000000000000000000";

export const hash = (n: number) => n.toString(16).toUpperCase().padStart(64, "0");

/** Ripple-epoch seconds for a given ISO date */
export const rippleSec = (iso: string) => Date.parse(iso) / 1000 - 946684800;

export function xrpPaymentMeta(from: string, to: string, fromPrev: string, fromFinal: string, toPrev: string | null, toFinal: string, delivered: string): TxMeta {
  return {
    TransactionIndex: 3,
    TransactionResult: "tesSUCCESS",
    delivered_amount: delivered,
    AffectedNodes: [
      {
        ModifiedNode: {
          LedgerEntryType: "AccountRoot",
          LedgerIndex: "AA",
          FinalFields: { Account: from, Balance: fromFinal, Sequence: 11, OwnerCount: 0, Flags: 0 },
          PreviousFields: { Balance: fromPrev, Sequence: 10 },
        },
      },
      toPrev === null
        ? { CreatedNode: { LedgerEntryType: "AccountRoot", LedgerIndex: "BB", NewFields: { Account: to, Balance: toFinal, Sequence: 1 } } }
        : {
            ModifiedNode: {
              LedgerEntryType: "AccountRoot",
              LedgerIndex: "BB",
              FinalFields: { Account: to, Balance: toFinal, Sequence: 5, OwnerCount: 0, Flags: 0 },
              PreviousFields: { Balance: toPrev },
            },
          },
    ],
  };
}

export function env(n: number, tx: Partial<XrplTx> & { TransactionType: string; Account: string }, meta: TxMeta | null, opts: { ledger?: number; time?: string } = {}): TxEnvelope {
  return {
    hash: hash(n),
    tx: { Fee: "12", Sequence: n, Flags: 0, ...tx } as XrplTx,
    meta,
    ledgerIndex: opts.ledger ?? 90_000_000 + n,
    validated: true,
    closeTimeMs: opts.time ? Date.parse(opts.time) : Date.parse("2026-09-01T00:00:00Z") + n * 60_000,
  };
}

export const okMeta = (extra: Partial<TxMeta> = {}): TxMeta => ({ TransactionIndex: 0, TransactionResult: "tesSUCCESS", AffectedNodes: [], ...extra });
