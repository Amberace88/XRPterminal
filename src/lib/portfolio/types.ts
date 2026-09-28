import type { Fiat } from "@/lib/types/market";

export type ConnectedAccountType = "XRPL_WALLET" | "EXCHANGE_ACCOUNT" | "BLOCKCHAIN_WALLET" | "DEFI_ACCOUNT";
export type ExchangeId = "binance";
export type AccountStatus = "active" | "error" | "rejected" | "pending";

/** A connected account as seen by the client. Never contains secrets. */
export interface ConnectedAccount {
  id: string;
  type: ConnectedAccountType;
  label: string;
  /** XRPL classic address (public) */
  address: string | null;
  /** X-address destination tag, if the user entered an X-address */
  tag?: number | null;
  exchange?: ExchangeId | null;
  /** Non-reversible fingerprint of the API key, for display ("…a1b2") */
  keyFingerprint?: string | null;
  permissions?: Record<string, boolean> | null;
  status: AccountStatus;
  lastSyncedAt: number | null;
  createdAt: number;
  isPrimary?: boolean;
}

export interface Lot {
  id: string;
  asset: "XRP";
  side: "buy" | "sell";
  /** YYYY-MM-DD */
  date: string;
  /** decimal strings */
  qty: string;
  price: string;
  fee: string;
  currency: Fiat;
  note?: string;
  createdAt: number;
}

export type CostMethod = "FIFO" | "AVERAGE";

export interface ExchangeBalance {
  asset: string;
  free: string;
  locked: string;
}

export const ACCOUNT_TYPE_INFO: Record<ConnectedAccountType, { name: string; status: "LIVE" | "BETA" | "PLANNED"; description: string }> = {
  XRPL_WALLET: { name: "XRPL wallet", status: "LIVE", description: "Public XRP Ledger address — read-only, no keys, no signing." },
  EXCHANGE_ACCOUNT: { name: "Exchange account", status: "BETA", description: "Read-only API key (Binance). Keys with trading, transfer or withdrawal permissions are rejected." },
  BLOCKCHAIN_WALLET: { name: "Other blockchain wallet", status: "PLANNED", description: "Public addresses on other chains — planned; requires chain data providers we have not connected yet." },
  DEFI_ACCOUNT: { name: "DeFi account", status: "PLANNED", description: "DeFi positions — planned; position data requires protocol integrations not yet available." },
};
