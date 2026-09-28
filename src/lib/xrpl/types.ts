/**
 * Types for raw rippled WebSocket JSON (API v1 + v2 shapes).
 * Only the fields this module reads are typed; everything else stays `unknown`.
 */

export type Json = Record<string, unknown>;

export interface IssuedAmount {
  currency: string;
  issuer: string;
  value: string;
}

export interface MptAmount {
  mpt_issuance_id: string;
  value: string;
}

/** XRP in drops (string) | issued currency | MPT. */
export type XrplAmount = string | IssuedAmount | MptAmount;

export interface MemoWrapper {
  Memo?: { MemoType?: string; MemoData?: string; MemoFormat?: string };
}

export interface XrplTx {
  TransactionType: string;
  Account: string;
  Destination?: string;
  Amount?: XrplAmount;
  /** API v2 renames Payment.Amount → DeliverMax */
  DeliverMax?: XrplAmount;
  SendMax?: XrplAmount;
  DeliverMin?: XrplAmount;
  TakerGets?: XrplAmount;
  TakerPays?: XrplAmount;
  LimitAmount?: IssuedAmount;
  Fee?: string;
  Sequence?: number;
  TicketSequence?: number;
  Flags?: number;
  SetFlag?: number;
  ClearFlag?: number;
  DestinationTag?: number;
  SourceTag?: number;
  OfferSequence?: number;
  Memos?: MemoWrapper[];
  Domain?: string;
  hash?: string;
  date?: number;
  ledger_index?: number;
  [k: string]: unknown;
}

export interface LedgerNodeBody {
  LedgerEntryType: string;
  LedgerIndex: string;
  FinalFields?: Json;
  PreviousFields?: Json;
  NewFields?: Json;
  PreviousTxnID?: string;
  PreviousTxnLgrSeq?: number;
}

export interface AffectedNode {
  CreatedNode?: LedgerNodeBody;
  ModifiedNode?: LedgerNodeBody;
  DeletedNode?: LedgerNodeBody;
}

export interface TxMeta {
  TransactionIndex?: number;
  TransactionResult: string;
  AffectedNodes: AffectedNode[];
  delivered_amount?: XrplAmount | "unavailable";
  DeliveredAmount?: XrplAmount;
}

/** One transaction in a normalized, version-independent shape. */
export interface TxEnvelope {
  hash: string;
  tx: XrplTx;
  meta: TxMeta | null;
  ledgerIndex: number | null;
  validated: boolean;
  /** UTC ms of ledger close, when known */
  closeTimeMs: number | null;
}

/** `{type:"ledgerClosed"}` stream message (ledger stream). */
export interface LedgerClosedMsg {
  type: "ledgerClosed";
  ledger_index: number;
  ledger_hash?: string;
  ledger_time: number;
  txn_count?: number;
  fee_base?: number;
  reserve_base?: number;
  reserve_inc?: number;
  validated_ledgers?: string;
}

export interface AccountRootData {
  Account: string;
  Balance: string;
  Sequence: number;
  OwnerCount: number;
  Flags: number;
  Domain?: string;
  EmailHash?: string;
  RegularKey?: string;
  AMMID?: string;
  MessageKey?: string;
  TransferRate?: number;
  TickSize?: number;
  urlgravatar?: string;
  [k: string]: unknown;
}

export interface AccountInfoResult {
  account_data: AccountRootData;
  ledger_index?: number;
  ledger_current_index?: number;
  validated?: boolean;
  account_flags?: Record<string, boolean>;
}

export interface TrustLine {
  account: string;
  balance: string;
  currency: string;
  limit: string;
  limit_peer: string;
  quality_in?: number;
  quality_out?: number;
  no_ripple?: boolean;
  no_ripple_peer?: boolean;
  freeze?: boolean;
  freeze_peer?: boolean;
  authorized?: boolean;
}

export interface AccountLinesResult {
  account: string;
  lines: TrustLine[];
  marker?: unknown;
  ledger_index?: number;
}

export interface AccountOffer {
  flags: number;
  seq: number;
  taker_gets: XrplAmount;
  taker_pays: XrplAmount;
  quality: string;
  expiration?: number;
}

export interface AccountOffersResult {
  account: string;
  offers: AccountOffer[];
  marker?: unknown;
}

export interface AccountTxResult {
  account: string;
  ledger_index_min?: number;
  ledger_index_max?: number;
  limit?: number;
  marker?: unknown;
  transactions: Json[];
  validated?: boolean;
}

export interface ServerInfoResult {
  info: {
    build_version?: string;
    complete_ledgers?: string;
    hostid?: string;
    load_factor?: number;
    peers?: number;
    server_state?: string;
    uptime?: number;
    network_id?: number;
    validation_quorum?: number;
    io_latency_ms?: number;
    last_close?: { converge_time_s?: number; proposers?: number };
    validated_ledger?: {
      age?: number;
      base_fee_xrp?: number;
      hash?: string;
      reserve_base_xrp?: number;
      reserve_inc_xrp?: number;
      seq?: number;
    };
  };
}

export interface GatewayBalancesResult {
  account: string;
  obligations?: Record<string, string>;
  balances?: Record<string, { currency: string; value: string }[]>;
  assets?: Record<string, { currency: string; value: string }[]>;
  ledger_index?: number;
}
