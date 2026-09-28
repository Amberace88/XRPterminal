import { rippleTimeToMs } from "@/lib/format";
import type { Json, TxEnvelope, TxMeta, XrplTx } from "./types";

/* -------------------------------------------------------------------------- */
/* Envelope normalization (API v1 `transaction` / `tx` and v2 `tx_json` shapes) */
/* -------------------------------------------------------------------------- */

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseIsoMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Normalize any rippled transaction container into a TxEnvelope:
 *  - transactions stream: {type:"transaction", transaction|tx_json, meta, hash, ledger_index, validated}
 *  - account_tx entries:  {tx, meta, validated} (v1) / {tx_json, meta, hash, ledger_index, close_time_iso} (v2)
 *  - tx command result:   {...fields, hash, meta, date} (v1) / {tx_json, meta, hash, close_time_iso} (v2)
 *  - ledger (expand):     {...fields, hash, metaData} (v1) / {tx_json, meta, hash} (v2)
 */
export function normalizeTxEnvelope(raw: unknown): TxEnvelope | null {
  if (!isObj(raw)) return null;
  let tx: Json | null = null;
  if (isObj(raw.tx_json)) tx = raw.tx_json;
  else if (isObj(raw.transaction)) tx = raw.transaction;
  else if (isObj(raw.tx)) tx = raw.tx;
  else if (typeof raw.TransactionType === "string") tx = raw;
  if (!tx || typeof tx.TransactionType !== "string" || typeof tx.Account !== "string") return null;

  const metaRaw = isObj(raw.meta) ? raw.meta : isObj(raw.metaData) ? raw.metaData : isObj(tx.meta) ? tx.meta : isObj(tx.metaData) ? tx.metaData : null;
  const meta: TxMeta | null =
    metaRaw && typeof metaRaw.TransactionResult === "string"
      ? { ...(metaRaw as unknown as TxMeta), AffectedNodes: Array.isArray(metaRaw.AffectedNodes) ? (metaRaw.AffectedNodes as TxMeta["AffectedNodes"]) : [] }
      : null;

  const hash = String(raw.hash ?? tx.hash ?? "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hash)) return null;

  const li = raw.ledger_index ?? tx.ledger_index ?? raw.inLedger ?? tx.inLedger;
  const ledgerIndex = typeof li === "number" ? li : typeof li === "string" && /^\d+$/.test(li) ? Number(li) : null;

  const date = typeof tx.date === "number" ? tx.date : typeof raw.date === "number" ? raw.date : null;
  const closeTimeMs = date !== null ? rippleTimeToMs(date) : parseIsoMs(raw.close_time_iso) ?? parseIsoMs(tx.close_time_iso);

  // Strip non-transaction fields that v1 flattens into the tx object.
  const { meta: _m, metaData: _md, validated: _v, inLedger: _il, ...clean } = tx;
  void _m;
  void _md;
  void _v;
  void _il;

  return {
    hash,
    tx: clean as unknown as XrplTx,
    meta,
    ledgerIndex,
    validated: raw.validated === true || tx.validated === true,
    closeTimeMs,
  };
}

export function txResult(env: Pick<TxEnvelope, "meta"> & { engineResult?: string }): string {
  return env.meta?.TransactionResult ?? env.engineResult ?? "unknown";
}

export const isSuccess = (env: Pick<TxEnvelope, "meta">) => env.meta?.TransactionResult === "tesSUCCESS";

/* -------------------------------------------------------------------------- */
/* Result codes                                                                */
/* -------------------------------------------------------------------------- */

const RESULT_TEXT: Record<string, string> = {
  tesSUCCESS: "The transaction was applied and succeeded.",
  tecCLAIM: "Unknown failure, but the transaction cost was destroyed.",
  tecPATH_DRY: "The payment could not deliver anything: no liquidity or trust path between sender and recipient.",
  tecPATH_PARTIAL: "The payment failed because the path could only deliver part of the amount (and partial payment was not allowed).",
  tecUNFUNDED_PAYMENT: "The sender did not hold enough of the currency to send this payment.",
  tecUNFUNDED_OFFER: "The offer's creator did not hold any of the currency being sold.",
  tecUNFUNDED: "The account lacked the funds required for this transaction.",
  tecNO_DST: "The destination account does not exist (and the amount was not enough XRP to create it).",
  tecNO_DST_INSUF_XRP: "The destination account does not exist and the payment did not send enough XRP to meet the base reserve.",
  tecDST_TAG_NEEDED: "The destination requires a destination tag and none was provided.",
  tecNO_LINE: "The account has no trust line for this currency.",
  tecNO_LINE_INSUF_RESERVE: "No trust line exists and the account lacks the XRP reserve to create one.",
  tecNO_LINE_REDUNDANT: "The trust line could not be created because it would be in the default state.",
  tecINSUFFICIENT_RESERVE: "The account does not hold enough XRP to meet the reserve for the new ledger object.",
  tecINSUF_RESERVE_LINE: "Not enough XRP reserve to create the trust line.",
  tecINSUF_RESERVE_OFFER: "Not enough XRP reserve to place this offer.",
  tecKILLED: "The offer was Fill-or-Kill / Immediate-or-Cancel and could not be (fully) filled, so it was cancelled.",
  tecNO_PERMISSION: "The sender does not have permission for this operation.",
  tecNO_AUTH: "The trust line is not authorized by the issuer.",
  tecFROZEN: "The asset is frozen by its issuer.",
  tecNO_ISSUER: "The issuer of the currency does not exist.",
  tecEXPIRED: "The object (offer, check, escrow…) has expired.",
  tecDUPLICATE: "The ledger object already exists.",
  tecHAS_OBLIGATIONS: "The account cannot be deleted because it still owns ledger objects.",
  tecTOO_SOON: "The account cannot be deleted yet (its sequence number is too recent).",
  tecNO_ENTRY: "The referenced ledger object does not exist.",
  tecNO_TARGET: "The referenced target object does not exist.",
  tecOWNERS: "The operation is not allowed while the account owns objects.",
  tecDIR_FULL: "The owner directory is full.",
  tecOVERSIZE: "Processing required too many ledger changes; the transaction could not be applied fully.",
  tecNO_ALTERNATIVE_KEY: "The last available signing key cannot be removed.",
  tecCRYPTOCONDITION_ERROR: "The escrow crypto-condition was invalid or not fulfilled.",
  tecINVARIANT_FAILED: "An invariant check failed while applying the transaction; the fee was still charged.",
  tecAMM_BALANCE: "The AMM operation would leave the pool with an invalid balance.",
  tecAMM_FAILED: "The AMM operation failed.",
  tecAMM_INVALID_TOKENS: "The AMM LP token amount is invalid.",
  tecAMM_EMPTY: "The AMM pool is empty.",
  tecAMM_NOT_EMPTY: "The AMM pool is not empty.",
  tecAMM_ACCOUNT: "This operation is not allowed on an AMM account.",
  tecINCOMPLETE: "The transaction did not finish all its work (e.g. too many objects to delete); submit again.",
  tecNFTOKEN_BUY_SELL_MISMATCH: "The NFT buy and sell offers do not match.",
  tecINSUFFICIENT_FUNDS: "Insufficient funds for this NFT operation.",
  tecMAX_SEQUENCE_REACHED: "The maximum sequence number was reached.",
};

export type ResultClass = "success" | "failed-fee-claimed" | "not-applied" | "unknown";

export function explainResult(code: string): { cls: ResultClass; title: string; explanation: string } {
  const text = RESULT_TEXT[code];
  if (code === "tesSUCCESS") return { cls: "success", title: "Success", explanation: RESULT_TEXT.tesSUCCESS };
  if (code.startsWith("tec"))
    return {
      cls: "failed-fee-claimed",
      title: "Failed — fee charged",
      explanation: `${text || "The transaction failed."} It was included in a validated ledger only to charge the transaction cost; no other change was made.`,
    };
  if (/^(tef|tel|tem|ter)/.test(code))
    return {
      cls: "not-applied",
      title: "Not applied",
      explanation: `${code} results are not included in validated ledgers — the transaction had no effect and no fee was charged.`,
    };
  return { cls: "unknown", title: code || "Unknown", explanation: "Result code not recognised." };
}

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

const TX_FLAGS: Record<string, Record<string, number>> = {
  Payment: { tfNoRippleDirect: 0x00010000, tfPartialPayment: 0x00020000, tfLimitQuality: 0x00040000 },
  OfferCreate: { tfPassive: 0x00010000, tfImmediateOrCancel: 0x00020000, tfFillOrKill: 0x00040000, tfSell: 0x00080000 },
  TrustSet: {
    tfSetfAuth: 0x00010000,
    tfSetNoRipple: 0x00020000,
    tfClearNoRipple: 0x00040000,
    tfSetFreeze: 0x00100000,
    tfClearFreeze: 0x00200000,
  },
  AccountSet: {
    tfRequireDestTag: 0x00010000,
    tfOptionalDestTag: 0x00020000,
    tfRequireAuth: 0x00040000,
    tfOptionalAuth: 0x00080000,
    tfDisallowXRP: 0x00100000,
    tfAllowXRP: 0x00200000,
  },
  NFTokenMint: { tfBurnable: 0x0001, tfOnlyXRP: 0x0002, tfTrustLine: 0x0004, tfTransferable: 0x0008, tfMutable: 0x0010 },
  NFTokenCreateOffer: { tfSellNFToken: 0x0001 },
  PaymentChannelClaim: { tfRenew: 0x00010000, tfClose: 0x00020000 },
  AMMDeposit: {
    tfLPToken: 0x00010000,
    tfSingleAsset: 0x00080000,
    tfTwoAsset: 0x00100000,
    tfOneAssetLPToken: 0x00200000,
    tfLimitLPToken: 0x00400000,
    tfTwoAssetIfEmpty: 0x00800000,
  },
  AMMWithdraw: {
    tfLPToken: 0x00010000,
    tfWithdrawAll: 0x00020000,
    tfOneAssetWithdrawAll: 0x00040000,
    tfSingleAsset: 0x00080000,
    tfTwoAsset: 0x00100000,
    tfOneAssetLPToken: 0x00200000,
    tfLimitLPToken: 0x00400000,
  },
  AMMClawback: { tfClawTwoAssets: 0x00000001 },
};

const GLOBAL_FLAGS: Record<string, number> = { tfFullyCanonicalSig: 0x80000000, tfInnerBatchTxn: 0x40000000 };

/** Decode Flags of common transaction types; unknown bits are returned as hex. */
export function decodeTxFlags(type: string, flags: number | undefined): { names: string[]; unknown: string | null } {
  const f = (flags ?? 0) >>> 0;
  if (!f) return { names: [], unknown: null };
  const table = { ...(TX_FLAGS[type] ?? {}), ...GLOBAL_FLAGS };
  const names: string[] = [];
  let known = 0;
  for (const [name, bit] of Object.entries(table)) {
    if ((f & bit) >>> 0 === bit) {
      names.push(name);
      known = (known | bit) >>> 0;
    }
  }
  const rest = (f & ~known) >>> 0;
  return { names, unknown: rest ? `0x${rest.toString(16).toUpperCase().padStart(8, "0")}` : null };
}

/** AccountSet SetFlag / ClearFlag values (asf*). */
export const ASF_FLAGS: Record<number, string> = {
  1: "asfRequireDest",
  2: "asfRequireAuth",
  3: "asfDisallowXRP",
  4: "asfDisableMaster",
  5: "asfAccountTxnID",
  6: "asfNoFreeze",
  7: "asfGlobalFreeze",
  8: "asfDefaultRipple",
  9: "asfDepositAuth",
  10: "asfAuthorizedNFTokenMinter",
  12: "asfDisallowIncomingNFTokenOffer",
  13: "asfDisallowIncomingCheck",
  14: "asfDisallowIncomingPayChan",
  15: "asfDisallowIncomingTrustline",
  16: "asfAllowTrustLineClawback",
};

/** AccountRoot ledger-entry flags (lsf*). */
export const ACCOUNT_ROOT_FLAGS: Record<string, number> = {
  lsfPasswordSpent: 0x00010000,
  lsfRequireDestTag: 0x00020000,
  lsfRequireAuth: 0x00040000,
  lsfDisallowXRP: 0x00080000,
  lsfDisableMaster: 0x00100000,
  lsfNoFreeze: 0x00200000,
  lsfGlobalFreeze: 0x00400000,
  lsfDefaultRipple: 0x00800000,
  lsfDepositAuth: 0x01000000,
  lsfAMM: 0x02000000,
  lsfDisallowIncomingNFTokenOffer: 0x04000000,
  lsfDisallowIncomingCheck: 0x08000000,
  lsfDisallowIncomingPayChan: 0x10000000,
  lsfDisallowIncomingTrustline: 0x20000000,
  lsfAllowTrustLineClawback: 0x80000000,
};

export function decodeAccountFlags(flags: number | undefined): string[] {
  const f = (flags ?? 0) >>> 0;
  return Object.entries(ACCOUNT_ROOT_FLAGS)
    .filter(([, bit]) => (f & bit) >>> 0 === bit)
    .map(([n]) => n);
}

/* -------------------------------------------------------------------------- */
/* Memos & hex text                                                            */
/* -------------------------------------------------------------------------- */

/** Decode hex → UTF-8. `printable` false when the bytes are not valid, readable text. */
export function hexToUtf8(hex: string | undefined | null): { text: string; printable: boolean } {
  if (!hex || !/^([0-9A-Fa-f]{2})*$/.test(hex)) return { text: hex ?? "", printable: false };
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    const printable = text.length > 0 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
    return { text, printable };
  } catch {
    return { text: hex, printable: false };
  }
}

export interface DecodedMemo {
  type: string | null;
  format: string | null;
  data: string | null;
  dataHex: string | null;
  printable: boolean;
}

export function decodeMemos(tx: XrplTx): DecodedMemo[] {
  if (!Array.isArray(tx.Memos)) return [];
  return tx.Memos.map((w) => {
    const m = w?.Memo ?? {};
    const t = m.MemoType ? hexToUtf8(m.MemoType) : null;
    const f = m.MemoFormat ? hexToUtf8(m.MemoFormat) : null;
    const d = m.MemoData ? hexToUtf8(m.MemoData) : null;
    return {
      type: t ? (t.printable ? t.text : m.MemoType ?? null) : null,
      format: f ? (f.printable ? f.text : m.MemoFormat ?? null) : null,
      data: d ? (d.printable ? d.text : null) : null,
      dataHex: m.MemoData ?? null,
      printable: d ? d.printable : true,
    };
  });
}

/** On-ledger Domain field (hex) → text; null if absent/unreadable. */
export function decodeDomain(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const r = hexToUtf8(hex);
  return r.printable ? r.text.trim() : null;
}

/* -------------------------------------------------------------------------- */
/* Descriptions                                                                */
/* -------------------------------------------------------------------------- */

export const TX_TYPE_GROUP: Record<string, "payment" | "dex" | "trustline" | "amm" | "nft" | "account" | "escrow" | "channel" | "check" | "other"> = {
  Payment: "payment",
  OfferCreate: "dex",
  OfferCancel: "dex",
  TrustSet: "trustline",
  AMMCreate: "amm",
  AMMDeposit: "amm",
  AMMWithdraw: "amm",
  AMMVote: "amm",
  AMMBid: "amm",
  AMMDelete: "amm",
  AMMClawback: "amm",
  NFTokenMint: "nft",
  NFTokenBurn: "nft",
  NFTokenCreateOffer: "nft",
  NFTokenCancelOffer: "nft",
  NFTokenAcceptOffer: "nft",
  NFTokenModify: "nft",
  AccountSet: "account",
  AccountDelete: "account",
  SetRegularKey: "account",
  SignerListSet: "account",
  TicketCreate: "account",
  DepositPreauth: "account",
  EscrowCreate: "escrow",
  EscrowFinish: "escrow",
  EscrowCancel: "escrow",
  PaymentChannelCreate: "channel",
  PaymentChannelFund: "channel",
  PaymentChannelClaim: "channel",
  CheckCreate: "check",
  CheckCash: "check",
  CheckCancel: "check",
};

export const TX_TYPE_DESCRIPTION: Record<string, string> = {
  Payment: "Transfers value (XRP or tokens) from one account to another.",
  OfferCreate: "Places an order on the XRP Ledger's built-in decentralized exchange.",
  OfferCancel: "Removes an order from the decentralized exchange.",
  TrustSet: "Creates or modifies a trust line — permission to hold a token from an issuer.",
  AccountSet: "Changes account settings (flags, domain, etc.).",
  AccountDelete: "Deletes the account and sends its remaining XRP to a destination.",
  AMMCreate: "Creates an automated market maker pool.",
  AMMDeposit: "Deposits assets into an AMM pool in exchange for LP tokens.",
  AMMWithdraw: "Withdraws assets from an AMM pool by redeeming LP tokens.",
  AMMVote: "Votes on an AMM pool's trading fee.",
  AMMBid: "Bids for an AMM pool's auction slot (discounted trading fee).",
  NFTokenMint: "Mints a new NFT.",
  NFTokenBurn: "Destroys an NFT.",
  NFTokenCreateOffer: "Creates an offer to buy or sell an NFT.",
  NFTokenAcceptOffer: "Accepts an NFT buy/sell offer.",
  NFTokenCancelOffer: "Cancels NFT offers.",
  EscrowCreate: "Locks XRP until a time or condition.",
  EscrowFinish: "Releases escrowed XRP.",
  EscrowCancel: "Returns escrowed XRP to the sender after expiry.",
  CheckCreate: "Creates a deferred payment (check).",
  CheckCash: "Redeems a check.",
  CheckCancel: "Cancels a check.",
  SetRegularKey: "Assigns or removes a secondary signing key.",
  SignerListSet: "Configures multi-signing.",
  TicketCreate: "Reserves sequence numbers (tickets) for later use.",
  PaymentChannelCreate: "Opens a payment channel.",
  PaymentChannelClaim: "Claims XRP from a payment channel.",
  PaymentChannelFund: "Adds XRP to a payment channel.",
  DepositPreauth: "Pre-authorizes a sender for deposit-authorized accounts.",
};
