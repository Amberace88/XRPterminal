import type { NewsCategory } from "@/lib/news/types";
import type { Regime } from "@/lib/analytics/regime";

/** Alert engine types (spec §124–127, §181, §188–191). */

export type AlertCondition =
  | { type: "price_above"; value: number }
  | { type: "price_below"; value: number }
  | { type: "change_24h"; value: number; direction: "up" | "down" | "either" }
  | { type: "volatility_above"; value: number } // 30D annualized realized vol, %
  | { type: "volume_above"; value: number } // 24h quote volume USD (single venue)
  | { type: "regime_change"; to: Regime | "ANY" }
  | { type: "wallet_activity"; address: string; direction: "sent" | "received" | "any"; minXrp: number }
  | { type: "whale_tx"; minXrp: number }
  | { type: "news"; keywords: string[]; categories: NewsCategory[] }
  | { type: "forecast_change"; minShiftPct: number }
  | { type: "portfolio_value"; op: "above" | "below"; value: number };

export type ConditionType = AlertCondition["type"];

export const LEVEL_CONDITIONS: ConditionType[] = ["price_above", "price_below", "change_24h", "volatility_above", "volume_above", "portfolio_value"];
export const EVENT_CONDITIONS: ConditionType[] = ["regime_change", "wallet_activity", "whale_tx", "news", "forecast_change"];
/** Conditions the server-side job can evaluate (ticker-based). */
export const SERVER_EVALUABLE: ConditionType[] = ["price_above", "price_below", "change_24h", "volume_above"];

export type AlertPriority = "low" | "normal" | "critical";

export interface AlertChannels {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  conditions: AlertCondition[]; // AND
  priority: AlertPriority;
  cooldownMin: number;
  channels: AlertChannels;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt: number | null;
  triggerCount: number;
  watchlistItemId?: string | null;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  title: string;
  body: string;
  priority: AlertPriority;
  createdAt: number;
  origin: "client" | "server" | "test";
  channels: string[];
  dedupeKey: string;
  suppressed?: "cooldown" | "duplicate" | "daily_limit" | null;
}

export interface WalletTxEvent {
  hash: string;
  account: string;
  destination?: string;
  amountXrp: number;
  type: string;
  time: number;
}

export interface NewsEventInput {
  id: string;
  title: string;
  categories: NewsCategory[];
  url: string;
  source: string;
}

/** One evaluation tick's inputs. Undefined = data not available → condition cannot be true. */
export interface EvalContext {
  now: number;
  price?: number | null;
  changePct24h?: number | null;
  volume24hQuote?: number | null;
  vol30Pct?: number | null;
  regime?: Regime | null;
  prevRegime?: Regime | null;
  walletTxs?: WalletTxEvent[];
  whaleTxs?: WalletTxEvent[];
  news?: NewsEventInput[];
  forecast?: { current: { low: number; high: number } | null; previous: { low: number; high: number } | null };
  portfolioValueUsd?: number | null;
}

export interface ChannelSettings {
  inApp: boolean;
  push: boolean;
  email: boolean;
  dailyLimit: number;
}

export const DEFAULT_CHANNEL_SETTINGS: ChannelSettings = { inApp: true, push: false, email: false, dailyLimit: 50 };

export type WatchKind = "pair" | "wallet" | "trader" | "topic" | "entity";

export interface WatchItem {
  id: string;
  kind: WatchKind;
  value: string;
  label: string;
  createdAt: number;
}
