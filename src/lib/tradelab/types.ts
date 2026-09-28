/**
 * Trade Lab — shared types for the SIMULATED paper-trading engine.
 *
 * Money and quantities are carried as decimal strings (decimal.js) inside the
 * immutable ledger and the derived state, so replaying the same events always
 * yields exactly the same balances (spec §212, §214, §268). Values that only feed
 * charts (equity curve points, statistics) are plain numbers.
 *
 * v1 is LONG-ONLY on a single market (XRP-USD): a SELL can only reduce a held
 * long position, never open a short (spec §274 allows long-only initially).
 */

export type DecimalString = string;

export const TRADELAB_MARKET = "XRP-USD" as const;
export type TradeLabMarket = typeof TRADELAB_MARKET;

export const STARTING_CAPITAL_OPTIONS = [10_000, 50_000, 100_000, 250_000, 1_000_000] as const;
export const DEFAULT_STARTING_CAPITAL = 100_000;

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
export type TimeInForce = "GTC" | "DAY";
export type OrderStatus = "CREATED" | "OPEN" | "TRIGGERED" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
export type OrderRole = "ENTRY" | "EXIT" | "STOP_LOSS" | "TAKE_PROFIT";
export type Liquidity = "TAKER" | "MAKER";

export const TERMINAL_STATUSES: OrderStatus[] = ["FILLED", "CANCELLED", "EXPIRED", "REJECTED"];
export const isTerminal = (s: OrderStatus) => TERMINAL_STATUSES.includes(s);

/** Market snapshot captured at a point in time. The engine never sees anything newer than `t`. */
export interface MarketSnapshot {
  /** Last / mid price. */
  price: number;
  bid?: number;
  ask?: number;
  /** Time the simulation observed the snapshot (UTC ms). Drives event ordering. */
  t: number;
  /** Exchange/quote time if different from `t` (used for staleness checks). */
  quoteT?: number;
  /**
   * Optional recent volatility estimate in basis points (e.g. ATR / price of the
   * last candles). Only used when the volatility-adjusted slippage component is enabled.
   */
  volBps?: number;
  /** Where the snapshot came from, e.g. "Coinbase WS" or "Replay 1h candle". Stored on fills. */
  source?: string;
}

/** Attached stop-loss / take-profit: absolute price OR percent distance from the average fill. */
export interface Bracket {
  price?: DecimalString;
  pct?: DecimalString;
}

export interface SlippageModel {
  /** Fixed component in basis points (default 5 bps). */
  fixedBps: number;
  /** Additional bps per $100k of notional (size-adjusted, optional, default 0). */
  sizeBpsPer100k: number;
  /** Multiplier on snapshot.volBps (volatility-adjusted, optional, default 0). */
  volatilityFactor: number;
  /** Hard cap on total slippage in bps. */
  maxBps: number;
}

export interface FeeModel {
  /** Taker fee rate in percent (default 0.10%). */
  takerPct: number;
  /** Maker fee rate in percent for resting limit fills (default 0.05%). */
  makerPct: number;
  /** Human readable label stored as `fee_source` on each fill. */
  label: string;
}

export interface RiskSettings {
  /** Max risk per trade as % of equity (entry→stop distance × qty). 0 disables. */
  maxRiskPct: number;
  /** Max position value as % of equity after the order fills. 0 disables. */
  maxPositionPct: number;
  /** Max loss per UTC day as % of day-start equity. 0 disables. */
  maxDailyLossPct: number;
  /** Market orders are rejected when the quote is older than this (ms). */
  maxQuoteAgeMs: number;
  /** Optional deterministic partial-fill cap: max XRP filled per order per tick (null = no cap). */
  maxFillQtyPerTick: number | null;
}

export interface AccountSettings {
  slippage: SlippageModel;
  fees: FeeModel;
  risk: RiskSettings;
}

export const DEFAULT_SETTINGS: AccountSettings = {
  slippage: { fixedBps: 5, sizeBpsPer100k: 0, volatilityFactor: 0, maxBps: 200 },
  fees: { takerPct: 0.1, makerPct: 0.05, label: "Trade Lab default fee model (simulated)" },
  risk: { maxRiskPct: 2, maxPositionPct: 100, maxDailyLossPct: 0, maxQuoteAgeMs: 120_000, maxFillQtyPerTick: null },
};

/** Trader's plan captured with an entry order — used by Trade Review (spec §107, §110). */
export interface OrderPlan {
  plannedEntry?: DecimalString;
  plannedStop?: DecimalString;
  plannedTarget?: DecimalString;
  plannedRisk?: DecimalString;
}

export interface Order {
  id: string;
  side: Side;
  type: OrderType;
  role: OrderRole;
  qty: DecimalString;
  filledQty: DecimalString;
  avgFillPrice: DecimalString | null;
  limitPrice: DecimalString | null;
  stopPrice: DecimalString | null;
  tif: TimeInForce;
  expiresAt: number | null;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  triggeredAt: number | null;
  /** Price observed when the stop condition was met (spec §95 activation). */
  triggerObservedPrice: DecimalString | null;
  /** True when the order was marketable when it became active (taker); resting orders fill as maker. */
  marketableOnArrival: boolean;
  parentId: string | null;
  ocoGroup: string | null;
  stopLoss: Bracket | null;
  takeProfit: Bracket | null;
  childIds: string[];
  fees: DecimalString;
  slippageCost: DecimalString;
  plan: OrderPlan | null;
  note: string | null;
  reason: string | null;
}

export interface Fill {
  id: string;
  orderId: string;
  t: number;
  side: Side;
  role: OrderRole;
  qty: DecimalString;
  price: DecimalString;
  /** Reference price before slippage (ask/bid/last, or the limit for maker fills). */
  refPrice: DecimalString;
  slippageBps: number;
  slippageCost: DecimalString;
  gross: DecimalString;
  feeRate: number;
  feeAmount: DecimalString;
  feeSource: string;
  liquidity: Liquidity;
  /** gross + fee for buys (cash out), gross − fee for sells (cash in). */
  net: DecimalString;
  snapshotSource: string | null;
}

export interface Position {
  id: string;
  side: "LONG";
  qty: DecimalString;
  avgEntry: DecimalString;
  openedAt: number;
  updatedAt: number;
  /** Fees attributed to this position (entries + exits). */
  fees: DecimalString;
  slippageCost: DecimalString;
  realizedGross: DecimalString;
  maxQty: DecimalString;
  entryQtyTotal: DecimalString;
  entryValueTotal: DecimalString;
  exitQtyTotal: DecimalString;
  exitValueTotal: DecimalString;
  /** First entry order id — carries the plan / initial stop. */
  entryOrderId: string | null;
  initialStop: DecimalString | null;
  initialTarget: DecimalString | null;
  plan: OrderPlan | null;
  highWhileOpen: number;
  lowWhileOpen: number;
  exitRoles: OrderRole[];
}

/** Closed round-trip trade derived when a position returns to zero. */
export interface ClosedTrade {
  id: string;
  version: number;
  openedAt: number;
  closedAt: number;
  holdingMs: number;
  qty: number;
  avgEntry: number;
  avgExit: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  returnPct: number;
  slippageCost: number;
  initialStop: number | null;
  initialTarget: number | null;
  initialRisk: number | null;
  rMultiple: number | null;
  plannedEntry: number | null;
  plannedRisk: number | null;
  exitRoles: OrderRole[];
  entryOrderId: string | null;
  highWhileOpen: number;
  lowWhileOpen: number;
}

export interface EquityPoint {
  t: number;
  price: number;
  cash: number;
  positionValue: number;
  equity: number;
}

/* ------------------------------------------------------------------ */
/* Ledger events (immutable, append-only). */

export type EventType =
  | "ACCOUNT_CREATED"
  | "VIRTUAL_CAPITAL_ASSIGNED"
  | "SETTINGS_UPDATED"
  | "ORDER_CREATED"
  | "ORDER_ACCEPTED"
  | "ORDER_TRIGGERED"
  | "ORDER_FILLED"
  | "ORDER_CANCELLED"
  | "ORDER_EXPIRED"
  | "ORDER_REJECTED"
  | "FEE_CHARGED"
  | "POSITION_OPENED"
  | "POSITION_UPDATED"
  | "POSITION_CLOSED"
  | "REALIZED_PNL"
  | "PRICE_MARKED"
  | "RISK_LIMIT_BREACHED"
  | "ACCOUNT_RESET";

interface EventBase<T extends EventType, P> {
  /** Deterministic id: `${accountId}:${seq}`. */
  id: string;
  seq: number;
  accountId: string;
  /** Account version (incremented by ACCOUNT_RESET). */
  version: number;
  /** Simulation time the event refers to (UTC ms). */
  t: number;
  type: T;
  payload: P;
}

export type LedgerEvent =
  | EventBase<"ACCOUNT_CREATED", { name: string; market: TradeLabMarket; settings: AccountSettings; mode: "LIVE" | "REPLAY" }>
  | EventBase<"VIRTUAL_CAPITAL_ASSIGNED", { amount: DecimalString; note: string }>
  | EventBase<"SETTINGS_UPDATED", { settings: AccountSettings }>
  | EventBase<"ORDER_CREATED", { order: Order }>
  | EventBase<"ORDER_ACCEPTED", { orderId: string; marketableOnArrival: boolean }>
  | EventBase<"ORDER_TRIGGERED", { orderId: string; stopPrice: DecimalString; observedPrice: DecimalString; becomes: "MARKET" | "LIMIT"; marketable: boolean }>
  | EventBase<
      "ORDER_FILLED",
      { orderId: string; fill: Fill; filledQty: DecimalString; remainingQty: DecimalString; avgFillPrice: DecimalString; status: "FILLED" | "PARTIALLY_FILLED"; cashDelta: DecimalString }
    >
  | EventBase<"ORDER_CANCELLED", { orderId: string; reason: string }>
  | EventBase<"ORDER_EXPIRED", { orderId: string; reason: string }>
  | EventBase<"ORDER_REJECTED", { orderId: string; code: RejectCode; reason: string }>
  | EventBase<"FEE_CHARGED", { orderId: string; fillId: string; feeRate: number; feeAmount: DecimalString; feeSource: string; liquidity: Liquidity }>
  | EventBase<"POSITION_OPENED", { position: Position; markPrice: DecimalString }>
  | EventBase<"POSITION_UPDATED", { positionId: string; qty: DecimalString; avgEntry: DecimalString; markPrice: DecimalString; fillId: string }>
  | EventBase<"POSITION_CLOSED", { positionId: string; markPrice: DecimalString; fillId: string }>
  | EventBase<"REALIZED_PNL", { positionId: string; fillId: string; qty: DecimalString; entryPrice: DecimalString; exitPrice: DecimalString; amount: DecimalString }>
  | EventBase<"PRICE_MARKED", { price: DecimalString; source: string | null }>
  | EventBase<"RISK_LIMIT_BREACHED", { limit: "DAILY_LOSS"; detail: string }>
  | EventBase<"ACCOUNT_RESET", { newVersion: number; startingCapital: DecimalString; abandonedPositionQty: DecimalString; note: string }>;

export type RejectCode =
  | "NO_ACCOUNT"
  | "INVALID_QTY"
  | "INVALID_PRICE"
  | "INVALID_STOP"
  | "INVALID_LIMIT"
  | "INVALID_BRACKET"
  | "NO_MARKET_DATA"
  | "STALE_MARKET_DATA"
  | "INSUFFICIENT_CASH"
  | "INSUFFICIENT_POSITION"
  | "MAX_POSITION"
  | "MAX_RISK"
  | "DAILY_LOSS_LIMIT";

export interface AccountState {
  accountId: string;
  name: string;
  mode: "LIVE" | "REPLAY";
  initialized: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Next ledger sequence number. */
  seq: number;
  orderSeq: number;
  fillSeq: number;
  positionSeq: number;
  settings: AccountSettings;
  startingCapital: DecimalString;
  /** Version start time (creation or last reset). */
  versionStartedAt: number;
  cash: DecimalString;
  position: Position | null;
  orders: Record<string, Order>;
  orderIds: string[];
  fills: Fill[];
  trades: ClosedTrade[];
  realizedGross: DecimalString;
  feesPaid: DecimalString;
  slippageCost: DecimalString;
  lastPrice: DecimalString | null;
  lastPriceT: number | null;
  lastMarkT: number | null;
  equityCurve: EquityPoint[];
  peakEquity: number;
  maxDrawdownPct: number;
  dayKey: number | null;
  dayStartEquity: number | null;
  dailyLossBreachedDay: number | null;
}

export interface AccountSummary {
  startingCapital: number;
  cash: number;
  reservedCash: number;
  availableCash: number;
  positionQty: number;
  avgEntry: number | null;
  markPrice: number | null;
  positionValue: number;
  equity: number;
  unrealizedPnl: number;
  unrealizedPct: number | null;
  realizedGross: number;
  feesPaid: number;
  slippageCost: number;
  netPnl: number;
  returnPct: number;
  peakEquity: number;
  drawdownPct: number;
  maxDrawdownPct: number;
  dayPnl: number | null;
  openOrders: number;
}

/** Input from the order ticket. */
export interface OrderInput {
  side: Side;
  type: OrderType;
  qty: DecimalString | number;
  limitPrice?: DecimalString | number | null;
  stopPrice?: DecimalString | number | null;
  tif?: TimeInForce;
  stopLoss?: Bracket | null;
  takeProfit?: Bracket | null;
  note?: string | null;
  /** Internal: role for engine-created orders. */
  role?: OrderRole;
}
