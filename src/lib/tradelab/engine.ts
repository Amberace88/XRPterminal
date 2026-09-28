/**
 * Trade Lab paper-trading engine — SIMULATED ONLY. Never connects to an exchange.
 *
 * Event-sourced: every financial change is an immutable ledger event
 * (spec §214, §268). `AccountState` is DERIVED by replaying events through the
 * pure reducer `applyEvent`. Commands (`createAccount`, `placeOrder`,
 * `cancelOrder`, `processTick`, `resetAccount`, …) never mutate state directly:
 * they validate, emit events and return them together with the new state.
 *
 * Determinism: no Date.now(), no randomness. Ids come from sequence counters,
 * times come from the caller / market snapshot. Replaying the same events always
 * yields byte-identical state.
 *
 * Model assumptions (shown in the UI, spec §101, §272):
 * - LONG-ONLY in v1: SELL only reduces a held long; shorting is not supported.
 * - Market orders fill at ask (buy) / bid (sell) — or last price when no
 *   quote is present — ± slippage (fixed bps + optional size & volatility terms).
 * - Resting limit orders fill at their limit price as MAKER (maker fee, no slippage)
 *   once the snapshot crosses (buy: ask ≤ limit, sell: bid ≥ limit). Orders that were
 *   marketable on arrival fill as TAKER at the quote ± slippage, capped at the limit.
 * - Stops trigger on the quote (buy: ask ≥ stop, sell: bid ≤ stop). STOP → market
 *   fill (gaps fill through the stop). STOP-LIMIT → becomes a limit order.
 * - Optional deterministic partial fills via `maxFillQtyPerTick`.
 * - Attached SL/TP legs are created on each entry fill and linked OCO: the first
 *   leg that fills cancels its sibling. Closing a position cancels open sells.
 */
import { D, Dec, ZERO, moneyRound, n, parsePositive, qtyRound, s } from "./decimal";
import {
  DEFAULT_SETTINGS,
  STARTING_CAPITAL_OPTIONS,
  TRADELAB_MARKET,
  type AccountSettings,
  type AccountState,
  type AccountSummary,
  type Bracket,
  type ClosedTrade,
  type EquityPoint,
  type Fill,
  type LedgerEvent,
  type Liquidity,
  type MarketSnapshot,
  type Order,
  type OrderInput,
  type OrderRole,
  type OrderType,
  type Position,
  type RejectCode,
  type Side,
} from "./types";

export const ENGINE_VERSION = "tradelab-engine-1.0";
const DAY_MS = 86_400_000;
/** Mark-to-market cadence for the equity curve (live mode). */
export const MARK_INTERVAL_IN_POSITION_MS = 5 * 60_000;
export const MARK_INTERVAL_FLAT_MS = 60 * 60_000;
/** Additional mark when price moved this much (%) since the last curve point while in a position. */
export const MARK_MOVE_PCT = 1;

/* ------------------------------------------------------------------ */
/* State                                                               */

export function emptyState(accountId: string): AccountState {
  return {
    accountId,
    name: "",
    mode: "LIVE",
    initialized: false,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    seq: 1,
    orderSeq: 0,
    fillSeq: 0,
    positionSeq: 0,
    settings: DEFAULT_SETTINGS,
    startingCapital: "0",
    versionStartedAt: 0,
    cash: "0",
    position: null,
    orders: {},
    orderIds: [],
    fills: [],
    trades: [],
    realizedGross: "0",
    feesPaid: "0",
    slippageCost: "0",
    lastPrice: null,
    lastPriceT: null,
    lastMarkT: null,
    equityCurve: [],
    peakEquity: 0,
    maxDrawdownPct: 0,
    dayKey: null,
    dayStartEquity: null,
    dailyLossBreachedDay: null,
  };
}

const dayOf = (t: number) => Math.floor(t / DAY_MS);

function equityAt(st: AccountState, price: Dec): Dec {
  const qty = st.position ? D(st.position.qty) : ZERO;
  return D(st.cash).plus(qty.times(price));
}

/** Append an equity-curve point and update peak / drawdown / day tracking. */
function pushCurve(st: AccountState, t: number, price: Dec): AccountState {
  const qty = st.position ? D(st.position.qty) : ZERO;
  const posVal = qty.times(price);
  const eq = D(st.cash).plus(posVal).toNumber();
  const point: EquityPoint = { t, price: price.toNumber(), cash: n(st.cash), positionValue: posVal.toNumber(), equity: eq };
  const prev = st.equityCurve[st.equityCurve.length - 1];
  const peak = Math.max(st.peakEquity, eq);
  const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
  const dk = dayOf(t);
  let dayKey = st.dayKey;
  let dayStartEquity = st.dayStartEquity;
  if (dayKey === null || dk !== dayKey) {
    dayKey = dk;
    dayStartEquity = prev ? prev.equity : st.dayStartEquity ?? eq;
  }
  let position = st.position;
  if (position) {
    const p = price.toNumber();
    position = { ...position, highWhileOpen: Math.max(position.highWhileOpen, p), lowWhileOpen: Math.min(position.lowWhileOpen, p) };
  }
  return {
    ...st,
    position,
    equityCurve: [...st.equityCurve, point],
    peakEquity: peak,
    maxDrawdownPct: Math.max(st.maxDrawdownPct, dd),
    dayKey,
    dayStartEquity,
    lastPrice: s(price),
    lastPriceT: Math.max(st.lastPriceT ?? t, t),
  };
}

function patchOrder(st: AccountState, id: string, patch: Partial<Order>, t: number): AccountState {
  const o = st.orders[id];
  if (!o) return st;
  return { ...st, orders: { ...st.orders, [id]: { ...o, ...patch, updatedAt: t } } };
}

function tradeFromPosition(p: Position, closedAt: number, version: number): ClosedTrade {
  const qty = D(p.maxQty);
  const avgEntry = D(p.entryQtyTotal).gt(0) ? D(p.entryValueTotal).div(p.entryQtyTotal) : ZERO;
  const avgExit = D(p.exitQtyTotal).gt(0) ? D(p.exitValueTotal).div(p.exitQtyTotal) : ZERO;
  const gross = D(p.realizedGross);
  const fees = D(p.fees);
  const net = gross.minus(fees);
  const cost = D(p.entryValueTotal);
  const stop = p.initialStop !== null ? D(p.initialStop) : null;
  // R = realized net result / initial risk, where initial risk = (entry − initial stop) × size (spec §278)
  const risk = stop && avgEntry.gt(stop) ? avgEntry.minus(stop).times(D(p.entryQtyTotal)) : null;
  return {
    id: p.id,
    version,
    openedAt: p.openedAt,
    closedAt,
    holdingMs: closedAt - p.openedAt,
    qty: qty.toNumber(),
    avgEntry: avgEntry.toNumber(),
    avgExit: avgExit.toNumber(),
    grossPnl: gross.toNumber(),
    fees: fees.toNumber(),
    netPnl: net.toNumber(),
    returnPct: cost.gt(0) ? net.div(cost).times(100).toNumber() : 0,
    slippageCost: n(p.slippageCost),
    initialStop: stop ? stop.toNumber() : null,
    initialTarget: p.initialTarget !== null ? n(p.initialTarget) : null,
    initialRisk: risk ? risk.toNumber() : null,
    rMultiple: risk && risk.gt(0) ? net.div(risk).toNumber() : null,
    plannedEntry: p.plan?.plannedEntry ? n(p.plan.plannedEntry) : null,
    plannedRisk: p.plan?.plannedRisk ? n(p.plan.plannedRisk) : null,
    exitRoles: p.exitRoles,
    entryOrderId: p.entryOrderId,
    highWhileOpen: p.highWhileOpen,
    lowWhileOpen: p.lowWhileOpen,
  };
}

/** Pure reducer: (state, event) → new state. The ONLY place balances change. */
export function applyEvent(prev: AccountState, e: LedgerEvent): AccountState {
  let st: AccountState = { ...prev, seq: Math.max(prev.seq, e.seq + 1), updatedAt: e.t };
  switch (e.type) {
    case "ACCOUNT_CREATED":
      return { ...st, name: e.payload.name, settings: e.payload.settings, mode: e.payload.mode, createdAt: e.t, versionStartedAt: e.t, version: e.version };
    case "VIRTUAL_CAPITAL_ASSIGNED": {
      const cash = D(st.cash).plus(e.payload.amount);
      st = { ...st, cash: s(cash), startingCapital: s(D(st.startingCapital).plus(e.payload.amount)), initialized: true };
      const eq = cash.toNumber();
      return { ...st, peakEquity: Math.max(st.peakEquity, eq), dayStartEquity: st.dayStartEquity ?? eq, dayKey: st.dayKey ?? dayOf(e.t) };
    }
    case "SETTINGS_UPDATED":
      return { ...st, settings: e.payload.settings };
    case "ORDER_CREATED": {
      const o = e.payload.order;
      let orders = { ...st.orders, [o.id]: o };
      const parent = o.parentId ? orders[o.parentId] : undefined;
      if (parent) orders = { ...orders, [parent.id]: { ...parent, childIds: [...parent.childIds, o.id] } };
      return { ...st, orders, orderIds: [...st.orderIds, o.id], orderSeq: st.orderSeq + 1 };
    }
    case "ORDER_ACCEPTED":
      return patchOrder(st, e.payload.orderId, { status: "OPEN", marketableOnArrival: e.payload.marketableOnArrival }, e.t);
    case "ORDER_TRIGGERED":
      return patchOrder(
        st,
        e.payload.orderId,
        { status: "TRIGGERED", triggeredAt: e.t, triggerObservedPrice: e.payload.observedPrice, marketableOnArrival: e.payload.marketable },
        e.t,
      );
    case "ORDER_FILLED": {
      const f = e.payload.fill;
      const o = st.orders[e.payload.orderId];
      st = patchOrder(
        st,
        e.payload.orderId,
        {
          filledQty: e.payload.filledQty,
          avgFillPrice: e.payload.avgFillPrice,
          status: e.payload.status,
          slippageCost: s(D(o?.slippageCost ?? "0").plus(f.slippageCost)),
        },
        e.t,
      );
      const position = st.position ? { ...st.position, slippageCost: s(D(st.position.slippageCost).plus(f.slippageCost)) } : null;
      return {
        ...st,
        position,
        cash: s(D(st.cash).plus(e.payload.cashDelta)),
        fills: [...st.fills, f],
        fillSeq: st.fillSeq + 1,
        slippageCost: s(D(st.slippageCost).plus(f.slippageCost)),
      };
    }
    case "FEE_CHARGED": {
      const o = st.orders[e.payload.orderId];
      st = patchOrder(st, e.payload.orderId, { fees: s(D(o?.fees ?? "0").plus(e.payload.feeAmount)) }, e.t);
      const position = st.position ? { ...st.position, fees: s(D(st.position.fees).plus(e.payload.feeAmount)) } : null;
      return { ...st, position, cash: s(D(st.cash).minus(e.payload.feeAmount)), feesPaid: s(D(st.feesPaid).plus(e.payload.feeAmount)) };
    }
    case "POSITION_OPENED":
      st = { ...st, position: e.payload.position, positionSeq: st.positionSeq + 1 };
      return pushCurve(st, e.t, D(e.payload.markPrice));
    case "POSITION_UPDATED": {
      if (!st.position) return st;
      const f = st.fills.find((x) => x.id === e.payload.fillId);
      let p: Position = { ...st.position, qty: e.payload.qty, avgEntry: e.payload.avgEntry, updatedAt: e.t };
      if (f && f.side === "BUY") {
        p = {
          ...p,
          entryQtyTotal: s(D(p.entryQtyTotal).plus(f.qty)),
          entryValueTotal: s(D(p.entryValueTotal).plus(f.gross)),
          maxQty: s(Dec.max(D(p.maxQty), D(e.payload.qty))),
        };
      } else if (f) {
        p = {
          ...p,
          exitQtyTotal: s(D(p.exitQtyTotal).plus(f.qty)),
          exitValueTotal: s(D(p.exitValueTotal).plus(f.gross)),
          exitRoles: p.exitRoles.includes(f.role) ? p.exitRoles : [...p.exitRoles, f.role],
        };
      }
      return pushCurve({ ...st, position: p }, e.t, D(e.payload.markPrice));
    }
    case "REALIZED_PNL": {
      const position = st.position ? { ...st.position, realizedGross: s(D(st.position.realizedGross).plus(e.payload.amount)) } : null;
      return { ...st, position, realizedGross: s(D(st.realizedGross).plus(e.payload.amount)) };
    }
    case "POSITION_CLOSED": {
      if (!st.position) return st;
      const f = st.fills.find((x) => x.id === e.payload.fillId);
      let p: Position = { ...st.position, qty: "0", updatedAt: e.t };
      if (f) {
        p = {
          ...p,
          exitQtyTotal: s(D(p.exitQtyTotal).plus(f.qty)),
          exitValueTotal: s(D(p.exitValueTotal).plus(f.gross)),
          exitRoles: p.exitRoles.includes(f.role) ? p.exitRoles : [...p.exitRoles, f.role],
        };
      }
      const mark = D(e.payload.markPrice).toNumber();
      p = { ...p, highWhileOpen: Math.max(p.highWhileOpen, mark), lowWhileOpen: Math.min(p.lowWhileOpen, mark) };
      const trade = tradeFromPosition(p, e.t, st.version);
      return pushCurve({ ...st, position: null, trades: [...st.trades, trade] }, e.t, D(e.payload.markPrice));
    }
    case "PRICE_MARKED":
      return { ...pushCurve(st, e.t, D(e.payload.price)), lastMarkT: e.t };
    case "ORDER_CANCELLED":
      return patchOrder(st, e.payload.orderId, { status: "CANCELLED", reason: e.payload.reason }, e.t);
    case "ORDER_EXPIRED":
      return patchOrder(st, e.payload.orderId, { status: "EXPIRED", reason: e.payload.reason }, e.t);
    case "ORDER_REJECTED":
      return patchOrder(st, e.payload.orderId, { status: "REJECTED", reason: e.payload.reason }, e.t);
    case "RISK_LIMIT_BREACHED":
      return { ...st, dailyLossBreachedDay: dayOf(e.t) };
    case "ACCOUNT_RESET": {
      // New version: balances start fresh; counters keep increasing so ids stay unique across versions.
      const fresh = emptyState(st.accountId);
      return {
        ...fresh,
        name: st.name,
        mode: st.mode,
        settings: st.settings,
        createdAt: st.createdAt,
        updatedAt: e.t,
        seq: st.seq,
        orderSeq: st.orderSeq,
        fillSeq: st.fillSeq,
        positionSeq: st.positionSeq,
        version: e.payload.newVersion,
        versionStartedAt: e.t,
        lastPrice: st.lastPrice,
        lastPriceT: st.lastPriceT,
      };
    }
  }
}

/** Rebuild state from the full ledger (all versions). */
export function replayEvents(accountId: string, events: LedgerEvent[]): AccountState {
  const sorted = [...events].filter((e) => e.accountId === accountId).sort((a, b) => a.seq - b.seq);
  return sorted.reduce(applyEvent, emptyState(accountId));
}

/** State of a specific (possibly archived) version: replays events up to the next reset. */
export function stateAtVersion(accountId: string, events: LedgerEvent[], version: number): AccountState {
  const sorted = [...events].filter((e) => e.accountId === accountId).sort((a, b) => a.seq - b.seq);
  let st = emptyState(accountId);
  for (const e of sorted) {
    if (e.type === "ACCOUNT_RESET" && e.payload.newVersion > version) break;
    st = applyEvent(st, e);
  }
  return st;
}

export function listVersions(events: LedgerEvent[]): { version: number; startedAt: number }[] {
  const out: { version: number; startedAt: number }[] = [];
  for (const e of events) {
    if (e.type === "ACCOUNT_CREATED") out.push({ version: e.version, startedAt: e.t });
    if (e.type === "ACCOUNT_RESET") out.push({ version: e.payload.newVersion, startedAt: e.t });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Transaction helper: emits events and applies them immediately.      */

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistOmit<LedgerEvent, "id" | "seq" | "accountId" | "version"> & { version?: number };

class Tx {
  events: LedgerEvent[] = [];
  constructor(public state: AccountState) {}
  emit(draft: EventDraft): LedgerEvent {
    const st = this.state;
    const e = { ...draft, id: `${st.accountId}:${st.seq}`, seq: st.seq, accountId: st.accountId, version: draft.version ?? st.version } as LedgerEvent;
    this.state = applyEvent(st, e);
    this.events.push(e);
    return e;
  }
}

export interface CommandResult {
  events: LedgerEvent[];
  state: AccountState;
}

/* ------------------------------------------------------------------ */
/* Pricing models                                                      */

export function refPrice(snap: MarketSnapshot, side: Side): Dec {
  const q = side === "BUY" ? snap.ask : snap.bid;
  return D(q !== undefined && Number.isFinite(q) && q > 0 ? q : snap.price);
}

/** Total simulated slippage in bps for an order of `notional` USD (spec §272). */
export function slippageBps(settings: AccountSettings, notional: number, snap: MarketSnapshot | null): number {
  const m = settings.slippage;
  const size = m.sizeBpsPer100k > 0 ? (m.sizeBpsPer100k * Math.max(0, notional)) / 100_000 : 0;
  const vol = m.volatilityFactor > 0 && snap?.volBps && Number.isFinite(snap.volBps) ? m.volatilityFactor * snap.volBps : 0;
  const total = Math.max(0, m.fixedBps) + size + vol;
  return Math.min(total, m.maxBps > 0 ? m.maxBps : total);
}

function applySlippage(price: Dec, side: Side, bps: number): Dec {
  const f = D(bps).div(10_000);
  return moneyRound(side === "BUY" ? price.times(D(1).plus(f)) : price.times(D(1).minus(f)));
}

export function feeRate(settings: AccountSettings, liquidity: Liquidity): number {
  return liquidity === "MAKER" ? settings.fees.makerPct : settings.fees.takerPct;
}

function feeSource(settings: AccountSettings, liquidity: Liquidity): string {
  return `${settings.fees.label} · ${liquidity.toLowerCase()} ${feeRate(settings, liquidity).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

/* ------------------------------------------------------------------ */
/* Account commands                                                    */

export function createAccount(opts: {
  accountId: string;
  name?: string;
  startingCapital?: number;
  settings?: AccountSettings;
  t: number;
  mode?: "LIVE" | "REPLAY";
  /** Replay sessions may use custom capital; live accounts must use a standard option. */
  allowCustomCapital?: boolean;
}): CommandResult {
  const capital = opts.startingCapital ?? 100_000;
  if (!(capital > 0) || (!opts.allowCustomCapital && !(STARTING_CAPITAL_OPTIONS as readonly number[]).includes(capital))) {
    throw new Error(`Invalid starting capital ${capital}. Options: ${STARTING_CAPITAL_OPTIONS.join(", ")}`);
  }
  const tx = new Tx(emptyState(opts.accountId));
  tx.emit({
    type: "ACCOUNT_CREATED",
    t: opts.t,
    payload: { name: opts.name ?? "Paper account", market: TRADELAB_MARKET, settings: opts.settings ?? DEFAULT_SETTINGS, mode: opts.mode ?? "LIVE" },
  });
  tx.emit({ type: "VIRTUAL_CAPITAL_ASSIGNED", t: opts.t, payload: { amount: String(capital), note: "Virtual demo capital (simulated, not real money)" } });
  return { events: tx.events, state: tx.state };
}

export function updateSettings(state: AccountState, settings: AccountSettings, t: number): CommandResult {
  const tx = new Tx(state);
  tx.emit({ type: "SETTINGS_UPDATED", t, payload: { settings } });
  return { events: tx.events, state: tx.state };
}

/** Reset = new account version. The old ledger stays intact (spec §215). */
export function resetAccount(state: AccountState, startingCapital: number, t: number): CommandResult {
  if (!(STARTING_CAPITAL_OPTIONS as readonly number[]).includes(startingCapital) && state.mode === "LIVE") {
    throw new Error(`Invalid starting capital ${startingCapital}`);
  }
  const tx = new Tx(state);
  for (const id of activeOrderIds(tx.state)) tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId: id, reason: "Account reset" } });
  const newVersion = state.version + 1;
  tx.emit({
    type: "ACCOUNT_RESET",
    t,
    version: newVersion,
    payload: {
      newVersion,
      startingCapital: String(startingCapital),
      abandonedPositionQty: tx.state.position?.qty ?? "0",
      note: "Explicit user reset. Previous version remains in the ledger for audit.",
    },
  });
  tx.emit({ type: "VIRTUAL_CAPITAL_ASSIGNED", t, payload: { amount: String(startingCapital), note: `Virtual demo capital for version ${newVersion}` } });
  return { events: tx.events, state: tx.state };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */

export const isActive = (o: Order) => o.status === "OPEN" || o.status === "TRIGGERED" || o.status === "PARTIALLY_FILLED" || o.status === "CREATED";

export function activeOrderIds(st: AccountState): string[] {
  return st.orderIds.filter((id) => {
    const o = st.orders[id];
    return o && isActive(o);
  });
}

export function openOrders(st: AccountState): Order[] {
  return activeOrderIds(st).map((id) => st.orders[id]);
}

export function orderHistory(st: AccountState): Order[] {
  return st.orderIds.map((id) => st.orders[id]).filter((o) => o && !isActive(o));
}

/** Price basis used to reserve cash for an open BUY order. */
function reservePrice(st: AccountState, o: Order): Dec | null {
  const slip = D(1).plus(D(st.settings.slippage.fixedBps).div(10_000));
  if (o.type === "LIMIT" || o.type === "STOP_LIMIT") return o.limitPrice ? D(o.limitPrice) : null;
  if (o.type === "STOP") return o.stopPrice ? D(o.stopPrice).times(slip) : null;
  return st.lastPrice ? D(st.lastPrice).times(slip) : null;
}

export function reservedCash(st: AccountState, excludeId?: string): Dec {
  let r = ZERO;
  const taker = D(st.settings.fees.takerPct).div(100);
  for (const o of openOrders(st)) {
    if (o.side !== "BUY" || o.id === excludeId) continue;
    const p = reservePrice(st, o);
    if (!p) continue;
    const rem = D(o.qty).minus(o.filledQty);
    r = r.plus(rem.times(p).times(D(1).plus(taker)));
  }
  return moneyRound(r);
}

export function summarize(st: AccountState, markPrice?: number | null, now?: number): AccountSummary {
  const mark = markPrice && markPrice > 0 ? D(markPrice) : st.lastPrice ? D(st.lastPrice) : null;
  const qty = st.position ? D(st.position.qty) : ZERO;
  const posVal = mark ? qty.times(mark) : st.position ? qty.times(st.position.avgEntry) : ZERO;
  const cash = D(st.cash);
  const equity = cash.plus(posVal);
  const unreal = st.position && mark ? mark.minus(st.position.avgEntry).times(qty) : ZERO;
  const start = D(st.startingCapital);
  const eqN = equity.toNumber();
  const peak = Math.max(st.peakEquity, eqN);
  const dd = peak > 0 ? ((peak - eqN) / peak) * 100 : 0;
  const reserved = reservedCash(st);
  const ref = now ?? st.lastPriceT;
  const today = ref ? dayOf(ref) : null;
  return {
    startingCapital: start.toNumber(),
    cash: cash.toNumber(),
    reservedCash: reserved.toNumber(),
    availableCash: Dec.max(ZERO, cash.minus(reserved)).toNumber(),
    positionQty: qty.toNumber(),
    avgEntry: st.position ? n(st.position.avgEntry) : null,
    markPrice: mark ? mark.toNumber() : null,
    positionValue: posVal.toNumber(),
    equity: eqN,
    unrealizedPnl: unreal.toNumber(),
    unrealizedPct: st.position && D(st.position.avgEntry).gt(0) && mark ? mark.div(st.position.avgEntry).minus(1).times(100).toNumber() : null,
    realizedGross: n(st.realizedGross),
    feesPaid: n(st.feesPaid),
    slippageCost: n(st.slippageCost),
    netPnl: equity.minus(start).toNumber(),
    returnPct: start.gt(0) ? equity.div(start).minus(1).times(100).toNumber() : 0,
    peakEquity: peak,
    drawdownPct: dd,
    maxDrawdownPct: Math.max(st.maxDrawdownPct, dd),
    dayPnl: st.dayStartEquity !== null && today !== null && st.dayKey === today ? eqN - st.dayStartEquity : null,
    openOrders: activeOrderIds(st).length,
  };
}

/* ------------------------------------------------------------------ */
/* Validation & estimation                                             */

export interface NormalizedOrder {
  side: Side;
  type: OrderType;
  qty: Dec;
  limitPrice: Dec | null;
  stopPrice: Dec | null;
  tif: "GTC" | "DAY";
  stopLoss: Bracket | null;
  takeProfit: Bracket | null;
  role: OrderRole;
  note: string | null;
}

export interface Rejection {
  code: RejectCode;
  reason: string;
}

function normalizeBracket(b: Bracket | null | undefined): Bracket | null {
  if (!b) return null;
  const price = parsePositive(b.price ?? null);
  const pct = parsePositive(b.pct ?? null);
  if (price) return { price: s(moneyRound(price)) };
  if (pct) return { pct: s(pct) };
  return null;
}

/** Parse ticket input. Invalid numbers become null and are rejected by `validateOrder`. */
export function normalizeOrder(input: OrderInput): NormalizedOrder & { rawQtyInvalid: boolean; rawPriceInvalid: boolean } {
  const q = parsePositive(input.qty);
  const lim = input.limitPrice === undefined || input.limitPrice === null || input.limitPrice === "" ? null : parsePositive(input.limitPrice);
  const stp = input.stopPrice === undefined || input.stopPrice === null || input.stopPrice === "" ? null : parsePositive(input.stopPrice);
  const priceGiven = (v: unknown) => v !== undefined && v !== null && v !== "";
  return {
    side: input.side,
    type: input.type,
    qty: q ? qtyRound(q) : ZERO,
    limitPrice: lim ? moneyRound(lim) : null,
    stopPrice: stp ? moneyRound(stp) : null,
    tif: input.tif ?? "GTC",
    stopLoss: normalizeBracket(input.stopLoss),
    takeProfit: normalizeBracket(input.takeProfit),
    role: input.role ?? (input.side === "BUY" ? "ENTRY" : "EXIT"),
    note: input.note?.slice(0, 500) ?? null,
    rawQtyInvalid: !q,
    rawPriceInvalid: (priceGiven(input.limitPrice) && !lim) || (priceGiven(input.stopPrice) && !stp),
  };
}

/** Expected entry price used for validation / risk preview (never a future price). */
export function expectedFillPrice(st: AccountState, o: NormalizedOrder, snap: MarketSnapshot | null): { price: Dec | null; liquidity: Liquidity; ref: Dec | null; bps: number } {
  const ref = snap ? refPrice(snap, o.side) : st.lastPrice ? D(st.lastPrice) : null;
  const notional = ref ? o.qty.times(ref).toNumber() : 0;
  const bps = slippageBps(st.settings, notional, snap);
  switch (o.type) {
    case "MARKET":
      return { price: ref ? applySlippage(ref, o.side, bps) : null, liquidity: "TAKER", ref, bps };
    case "LIMIT": {
      if (!o.limitPrice) return { price: null, liquidity: "MAKER", ref, bps: 0 };
      const marketable = ref ? (o.side === "BUY" ? ref.lte(o.limitPrice) : ref.gte(o.limitPrice)) : false;
      if (marketable && ref) {
        const p = applySlippage(ref, o.side, bps);
        return { price: o.side === "BUY" ? Dec.min(p, o.limitPrice) : Dec.max(p, o.limitPrice), liquidity: "TAKER", ref, bps };
      }
      return { price: o.limitPrice, liquidity: "MAKER", ref: o.limitPrice, bps: 0 };
    }
    case "STOP":
      return { price: o.stopPrice ? applySlippage(o.stopPrice, o.side, bps) : null, liquidity: "TAKER", ref: o.stopPrice, bps };
    case "STOP_LIMIT":
      return { price: o.limitPrice, liquidity: "MAKER", ref: o.stopPrice, bps: 0 };
  }
}

export function resolveBracket(b: Bracket | null, entry: Dec, kind: "SL" | "TP"): Dec | null {
  if (!b) return null;
  if (b.price) return D(b.price);
  if (b.pct) return moneyRound(kind === "SL" ? entry.times(D(1).minus(D(b.pct).div(100))) : entry.times(D(1).plus(D(b.pct).div(100))));
  return null;
}

/**
 * Full validation (spec §213): quantity, prices, stop/limit relation, brackets,
 * market status, cash incl. fees, long-only, max position %, max risk %, daily loss.
 */
export function validateOrder(
  st: AccountState,
  o: ReturnType<typeof normalizeOrder>,
  snap: MarketSnapshot | null,
  t: number,
  opts: { requireFreshQuote?: boolean } = {},
): Rejection | null {
  if (!st.initialized) return { code: "NO_ACCOUNT", reason: "Create a paper account first." };
  if (o.rawQtyInvalid || o.qty.lte(0)) return { code: "INVALID_QTY", reason: "Quantity must be a positive number (min 0.000001 XRP)." };
  if (o.rawPriceInvalid) return { code: "INVALID_PRICE", reason: "Prices must be positive numbers." };
  if ((o.type === "LIMIT" || o.type === "STOP_LIMIT") && !o.limitPrice) return { code: "INVALID_LIMIT", reason: "A limit price is required." };
  if ((o.type === "STOP" || o.type === "STOP_LIMIT") && !o.stopPrice) return { code: "INVALID_STOP", reason: "A stop (trigger) price is required." };
  if (o.type === "STOP_LIMIT" && o.limitPrice && o.stopPrice) {
    if (o.side === "BUY" && o.limitPrice.lt(o.stopPrice)) return { code: "INVALID_LIMIT", reason: "Buy stop-limit: limit price must be at or above the stop price." };
    if (o.side === "SELL" && o.limitPrice.gt(o.stopPrice)) return { code: "INVALID_LIMIT", reason: "Sell stop-limit: limit price must be at or below the stop price." };
  }
  if (o.type === "MARKET" && opts.requireFreshQuote !== false) {
    if (!snap) return { code: "NO_MARKET_DATA", reason: "No market price available — market orders need a current quote." };
    if (t - (snap.quoteT ?? snap.t) > st.settings.risk.maxQuoteAgeMs) return { code: "STALE_MARKET_DATA", reason: `Quote is older than ${Math.round(st.settings.risk.maxQuoteAgeMs / 1000)}s — market order not simulated on stale data.` };
  }
  const ref = snap ? refPrice(snap, o.side) : null;
  if ((o.type === "STOP" || o.type === "STOP_LIMIT") && o.stopPrice && ref) {
    if (o.side === "BUY" && o.stopPrice.lte(ref)) return { code: "INVALID_STOP", reason: "Buy stop must be above the current ask (otherwise use a market or limit order)." };
    if (o.side === "SELL" && o.stopPrice.gte(ref)) return { code: "INVALID_STOP", reason: "Sell stop must be below the current bid." };
  }

  const held = st.position ? D(st.position.qty) : ZERO;
  if (o.side === "SELL") {
    if (o.stopLoss || o.takeProfit) return { code: "INVALID_BRACKET", reason: "Stop-loss / take-profit can only be attached to buy (entry) orders." };
    if (held.lte(0)) return { code: "INSUFFICIENT_POSITION", reason: "No XRP position to sell. Trade Lab v1 is long-only (no short selling)." };
    if (o.qty.gt(held)) return { code: "INSUFFICIENT_POSITION", reason: `Sell quantity exceeds the held position (${held.toFixed()} XRP). Long-only: shorting is not supported.` };
    return null;
  }

  // BUY checks
  const est = expectedFillPrice(st, o, snap);
  const entry = est.price;
  if (!entry) return { code: "NO_MARKET_DATA", reason: "Cannot estimate the entry price — no market data." };
  const sl = resolveBracket(o.stopLoss, entry, "SL");
  const tp = resolveBracket(o.takeProfit, entry, "TP");
  if (o.stopLoss && (!sl || sl.lte(0))) return { code: "INVALID_BRACKET", reason: "Invalid stop-loss." };
  if (o.stopLoss?.pct && D(o.stopLoss.pct).gte(100)) return { code: "INVALID_BRACKET", reason: "Stop-loss % must be below 100%." };
  if (sl && sl.gte(entry)) return { code: "INVALID_BRACKET", reason: "Stop-loss must be below the expected entry price (long position)." };
  if (tp && tp.lte(entry)) return { code: "INVALID_BRACKET", reason: "Take-profit must be above the expected entry price (long position)." };

  const rate = D(feeRate(st.settings, est.liquidity)).div(100);
  const cost = o.qty.times(entry).times(D(1).plus(rate));
  const available = D(st.cash).minus(reservedCash(st));
  if (cost.gt(available)) {
    return { code: "INSUFFICIENT_CASH", reason: `Insufficient virtual cash: needs ≈$${cost.toFixed(2)} incl. fee & slippage, available $${Dec.max(ZERO, available).toFixed(2)}.` };
  }
  const markP = snap ? D(snap.price) : st.lastPrice ? D(st.lastPrice) : entry;
  const equity = equityAt(st, markP);
  const risk = st.settings.risk;
  if (risk.maxPositionPct > 0 && risk.maxPositionPct < 100) {
    const after = held.plus(o.qty).times(entry);
    const pct = equity.gt(0) ? after.div(equity).times(100) : D(Infinity);
    if (pct.gt(risk.maxPositionPct + 1e-9)) {
      return { code: "MAX_POSITION", reason: `Position would be ${pct.toFixed(1)}% of equity — above your max position setting of ${risk.maxPositionPct}%.` };
    }
  }
  if (risk.maxRiskPct > 0 && sl) {
    const r = entry.minus(sl).times(o.qty);
    const pct = equity.gt(0) ? r.div(equity).times(100) : D(Infinity);
    if (pct.gt(risk.maxRiskPct + 1e-9)) {
      return { code: "MAX_RISK", reason: `Risk to stop is ${pct.toFixed(2)}% of equity — above your max risk per trade of ${risk.maxRiskPct}%.` };
    }
  }
  if (risk.maxDailyLossPct > 0) {
    const today = dayOf(t);
    if (st.dailyLossBreachedDay === today) return { code: "DAILY_LOSS_LIMIT", reason: "Daily loss limit reached — new entries are blocked until the next UTC day." };
    if (st.dayStartEquity && st.dayKey === today) {
      const loss = ((st.dayStartEquity - equity.toNumber()) / st.dayStartEquity) * 100;
      if (loss >= risk.maxDailyLossPct) return { code: "DAILY_LOSS_LIMIT", reason: `Today's loss is ${loss.toFixed(2)}% — at or above your daily loss limit of ${risk.maxDailyLossPct}%.` };
    }
  }
  return null;
}

export interface OrderEstimate {
  refPrice: number | null;
  estFillPrice: number | null;
  liquidity: Liquidity;
  slippageBps: number;
  slippageCost: number;
  gross: number;
  feeRatePct: number;
  fee: number;
  /** Cash out for buys (gross + fee), cash in for sells (gross − fee). */
  net: number;
  stopPrice: number | null;
  targetPrice: number | null;
  riskAmount: number | null;
  riskPct: number | null;
  stopDistancePct: number | null;
  rewardAmount: number | null;
  rewardRisk: number | null;
  positionPctAfter: number | null;
  equity: number | null;
  rejection: Rejection | null;
  warnings: string[];
}

/** Risk preview for the order ticket (spec §98, §104, §105, §273). Pure, no events. */
export function estimateOrder(st: AccountState, input: OrderInput, snap: MarketSnapshot | null, t: number): OrderEstimate {
  const o = normalizeOrder(input);
  const est = expectedFillPrice(st, o, snap);
  const price = est.price;
  const rate = feeRate(st.settings, est.liquidity);
  const gross = price ? o.qty.times(price) : ZERO;
  const fee = moneyRound(gross.times(rate).div(100));
  const slipCost = price && est.ref ? price.minus(est.ref).abs().times(o.qty) : ZERO;
  const sl = price ? resolveBracket(o.stopLoss, price, "SL") : null;
  const tp = price ? resolveBracket(o.takeProfit, price, "TP") : null;
  const markP = snap ? D(snap.price) : st.lastPrice ? D(st.lastPrice) : price;
  const equity = markP && st.initialized ? equityAt(st, markP) : null;
  const risk = price && sl && o.side === "BUY" ? price.minus(sl).times(o.qty) : null;
  const reward = price && tp && o.side === "BUY" ? tp.minus(price).times(o.qty) : null;
  const held = st.position ? D(st.position.qty) : ZERO;
  const warnings: string[] = [];
  if (o.side === "BUY" && !sl) warnings.push("No stop-loss: risk per trade is undefined (R-multiple cannot be measured).");
  if (snap && t - (snap.quoteT ?? snap.t) > st.settings.risk.maxQuoteAgeMs) warnings.push("Quote is stale — fills are simulated against the last captured price.");
  if (!snap?.bid || !snap?.ask) warnings.push("No bid/ask in the current feed — fills reference the last traded price.");
  return {
    refPrice: est.ref ? est.ref.toNumber() : null,
    estFillPrice: price ? price.toNumber() : null,
    liquidity: est.liquidity,
    slippageBps: est.bps,
    slippageCost: slipCost.toNumber(),
    gross: gross.toNumber(),
    feeRatePct: rate,
    fee: fee.toNumber(),
    net: o.side === "BUY" ? gross.plus(fee).toNumber() : gross.minus(fee).toNumber(),
    stopPrice: sl ? sl.toNumber() : null,
    targetPrice: tp ? tp.toNumber() : null,
    riskAmount: risk ? risk.toNumber() : null,
    riskPct: risk && equity && equity.gt(0) ? risk.div(equity).times(100).toNumber() : null,
    stopDistancePct: price && sl ? price.minus(sl).div(price).times(100).toNumber() : null,
    rewardAmount: reward ? reward.toNumber() : null,
    rewardRisk: risk && reward && risk.gt(0) ? reward.div(risk).toNumber() : null,
    positionPctAfter: price && equity && equity.gt(0) ? (o.side === "BUY" ? held.plus(o.qty) : Dec.max(ZERO, held.minus(o.qty))).times(price).div(equity).times(100).toNumber() : null,
    equity: equity ? equity.toNumber() : null,
    rejection: validateOrder(st, o, snap, t),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Order placement & cancellation                                      */

function endOfUtcDay(t: number): number {
  return (dayOf(t) + 1) * DAY_MS - 1;
}

function newOrder(tx: Tx, o: NormalizedOrder, t: number, extra: Partial<Order> = {}): Order {
  const id = `o${tx.state.orderSeq + 1}`;
  return {
    id,
    side: o.side,
    type: o.type,
    role: o.role,
    qty: s(o.qty),
    filledQty: "0",
    avgFillPrice: null,
    limitPrice: o.limitPrice ? s(o.limitPrice) : null,
    stopPrice: o.stopPrice ? s(o.stopPrice) : null,
    tif: o.tif,
    expiresAt: o.tif === "DAY" ? endOfUtcDay(t) : null,
    status: "CREATED",
    createdAt: t,
    updatedAt: t,
    triggeredAt: null,
    triggerObservedPrice: null,
    marketableOnArrival: false,
    parentId: null,
    ocoGroup: null,
    stopLoss: o.stopLoss,
    takeProfit: o.takeProfit,
    childIds: [],
    fees: "0",
    slippageCost: "0",
    plan: null,
    note: o.note,
    reason: null,
    ...extra,
  };
}

function isMarketable(o: Order, snap: MarketSnapshot): boolean {
  if (o.type === "MARKET") return true;
  if ((o.type === "LIMIT" || o.type === "STOP_LIMIT") && o.limitPrice) {
    const ref = refPrice(snap, o.side);
    return o.side === "BUY" ? ref.lte(o.limitPrice) : ref.gte(o.limitPrice);
  }
  return false;
}

export interface PlaceResult extends CommandResult {
  orderId: string;
  rejection: Rejection | null;
}

/**
 * Place an order. Emits ORDER_CREATED then ORDER_REJECTED (with reason) or
 * ORDER_ACCEPTED. Market / marketable orders fill immediately against `snap`.
 * With `deferToNextTick` (historical replay) the validated order stays CREATED and
 * "arrives" at the NEXT snapshot (e.g. the next candle open): ORDER_ACCEPTED, the
 * maker/taker decision and any fill all happen there — never on already-known prices.
 */
export function placeOrder(
  state: AccountState,
  input: OrderInput,
  snap: MarketSnapshot | null,
  t: number,
  opts: { deferToNextTick?: boolean } = {},
): PlaceResult {
  const tx = new Tx(state);
  const o = normalizeOrder(input);
  const rej = validateOrder(state, o, snap, t, { requireFreshQuote: !opts.deferToNextTick });
  const est = rej ? null : expectedFillPrice(state, o, snap);
  const plan =
    o.side === "BUY" && est?.price
      ? (() => {
          const sl = resolveBracket(o.stopLoss, est.price, "SL");
          const tp = resolveBracket(o.takeProfit, est.price, "TP");
          return {
            plannedEntry: s(est.price),
            plannedStop: sl ? s(sl) : undefined,
            plannedTarget: tp ? s(tp) : undefined,
            plannedRisk: sl ? s(moneyRound(est.price.minus(sl).times(o.qty))) : undefined,
          };
        })()
      : null;
  const order = newOrder(tx, o, t, { plan });
  tx.emit({ type: "ORDER_CREATED", t, payload: { order } });
  if (rej) {
    tx.emit({ type: "ORDER_REJECTED", t, payload: { orderId: order.id, code: rej.code, reason: rej.reason } });
    return { events: tx.events, state: tx.state, orderId: order.id, rejection: rej };
  }
  if (opts.deferToNextTick) return { events: tx.events, state: tx.state, orderId: order.id, rejection: null };
  const marketable = snap ? isMarketable(order, snap) : order.type === "MARKET";
  tx.emit({ type: "ORDER_ACCEPTED", t, payload: { orderId: order.id, marketableOnArrival: marketable } });
  if (snap && marketable) {
    evaluateOrder(tx, order.id, { ...snap, t: Math.max(snap.t, t) });
  }
  return { events: tx.events, state: tx.state, orderId: order.id, rejection: null };
}

export function cancelOrder(state: AccountState, orderId: string, t: number, reason = "Cancelled by user"): CommandResult {
  const tx = new Tx(state);
  const o = state.orders[orderId];
  if (!o || !isActive(o)) return { events: [], state };
  tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId, reason } });
  return { events: tx.events, state: tx.state };
}

/** Close the whole position at market: cancels open sell legs first, then sells everything. */
export function closePosition(state: AccountState, snap: MarketSnapshot | null, t: number, opts: { deferToNextTick?: boolean } = {}): PlaceResult | null {
  if (!state.position) return null;
  const tx = new Tx(state);
  for (const o of openOrders(state)) if (o.side === "SELL") tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId: o.id, reason: "Replaced by manual close" } });
  const r = placeOrder(tx.state, { side: "SELL", type: "MARKET", qty: state.position.qty, note: "Close position" }, snap, t, opts);
  return { ...r, events: [...tx.events, ...r.events] };
}

/* ------------------------------------------------------------------ */
/* Fill engine                                                         */

function cancelSiblings(tx: Tx, o: Order, t: number) {
  if (!o.ocoGroup) return;
  for (const id of activeOrderIds(tx.state)) {
    const x = tx.state.orders[id];
    if (x.id !== o.id && x.ocoGroup === o.ocoGroup) tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId: id, reason: `OCO: ${o.role === "STOP_LOSS" ? "stop-loss" : "take-profit"} leg filled` } });
  }
}

/** (Re)create SL/TP legs for an entry order sized to its cumulative filled quantity. */
function syncBracketLegs(tx: Tx, entryId: string, snap: MarketSnapshot, t: number) {
  const entry = tx.state.orders[entryId];
  if (!entry || entry.side !== "BUY" || (!entry.stopLoss && !entry.takeProfit) || !entry.avgFillPrice) return;
  for (const cid of entry.childIds) {
    const c = tx.state.orders[cid];
    if (c && isActive(c)) tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId: cid, reason: "Resized after additional entry fill" } });
  }
  const qty = D(entry.filledQty);
  const avg = D(entry.avgFillPrice);
  const group = `oco:${entry.id}:${entry.filledQty}`;
  const sl = resolveBracket(entry.stopLoss, avg, "SL");
  const tp = resolveBracket(entry.takeProfit, avg, "TP");
  const mk = (type: OrderType, role: OrderRole, price: Dec) => {
    const norm: NormalizedOrder = {
      side: "SELL",
      type,
      qty,
      limitPrice: type === "LIMIT" ? price : null,
      stopPrice: type === "STOP" ? price : null,
      tif: "GTC",
      stopLoss: null,
      takeProfit: null,
      role,
      note: `${role === "STOP_LOSS" ? "Stop-loss" : "Take-profit"} for ${entry.id}`,
    };
    const child = newOrder(tx, norm, t, { parentId: entry.id, ocoGroup: sl && tp ? group : null });
    tx.emit({ type: "ORDER_CREATED", t, payload: { order: child } });
    tx.emit({ type: "ORDER_ACCEPTED", t, payload: { orderId: child.id, marketableOnArrival: isMarketable(child, snap) } });
  };
  if (sl) mk("STOP", "STOP_LOSS", sl);
  if (tp) mk("LIMIT", "TAKE_PROFIT", tp);
}

/** Execute (part of) an order at `price`. Handles fees, cash, position, realized P&L, OCO and brackets. */
function fillOrder(tx: Tx, orderId: string, price: Dec, ref: Dec, bps: number, liquidity: Liquidity, snap: MarketSnapshot) {
  const t = snap.t;
  const st = tx.state;
  const o = st.orders[orderId];
  const settings = st.settings;
  let qty = D(o.qty).minus(o.filledQty);
  const cap = settings.risk.maxFillQtyPerTick;
  if (cap !== null && cap > 0) qty = Dec.min(qty, qtyRound(D(cap)));
  const rate = feeRate(settings, liquidity);
  const rateD = D(rate).div(100);

  if (o.side === "SELL") {
    const held = st.position ? D(st.position.qty) : ZERO;
    if (held.lte(0)) {
      tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId, reason: "No position left to sell (long-only)" } });
      return;
    }
    qty = Dec.min(qty, held);
  } else {
    const cash = D(st.cash);
    const need = qty.times(price).times(D(1).plus(rateD));
    if (need.gt(cash)) {
      const affordable = qtyRound(cash.div(price.times(D(1).plus(rateD))));
      if (affordable.lte(0)) {
        tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId, reason: "Insufficient virtual cash at fill time" } });
        return;
      }
      qty = affordable;
    }
  }
  if (qty.lte(0)) return;

  const gross = moneyRound(qty.times(price));
  const fee = moneyRound(gross.times(rateD));
  const slipCost = moneyRound(price.minus(ref).abs().times(qty));
  const filledBefore = D(o.filledQty);
  const filledAfter = filledBefore.plus(qty);
  const avgBefore = o.avgFillPrice ? D(o.avgFillPrice) : ZERO;
  const avgAfter = moneyRound(avgBefore.times(filledBefore).plus(price.times(qty)).div(filledAfter));
  const remaining = D(o.qty).minus(filledAfter);
  const fillId = `f${st.fillSeq + 1}`;
  const fill: Fill = {
    id: fillId,
    orderId,
    t,
    side: o.side,
    role: o.role,
    qty: s(qty),
    price: s(price),
    refPrice: s(ref),
    slippageBps: bps,
    slippageCost: s(slipCost),
    gross: s(gross),
    feeRate: rate,
    feeAmount: s(fee),
    feeSource: feeSource(settings, liquidity),
    liquidity,
    net: s(o.side === "BUY" ? gross.plus(fee) : gross.minus(fee)),
    snapshotSource: snap.source ?? null,
  };
  tx.emit({
    type: "ORDER_FILLED",
    t,
    payload: {
      orderId,
      fill,
      filledQty: s(filledAfter),
      remainingQty: s(remaining),
      avgFillPrice: s(avgAfter),
      status: remaining.lte(0) ? "FILLED" : "PARTIALLY_FILLED",
      cashDelta: s(o.side === "BUY" ? gross.neg() : gross),
    },
  });
  tx.emit({ type: "FEE_CHARGED", t, payload: { orderId, fillId, feeRate: rate, feeAmount: s(fee), feeSource: fill.feeSource, liquidity } });

  const mark = s(D(snap.price));
  const pos = tx.state.position;
  if (o.side === "BUY") {
    if (!pos) {
      const entryOrder = tx.state.orders[orderId];
      const sl = resolveBracket(entryOrder.stopLoss, price, "SL");
      const tp = resolveBracket(entryOrder.takeProfit, price, "TP");
      const position: Position = {
        id: `p${tx.state.positionSeq + 1}`,
        side: "LONG",
        qty: s(qty),
        avgEntry: s(price),
        openedAt: t,
        updatedAt: t,
        fees: s(fee),
        slippageCost: s(slipCost),
        realizedGross: "0",
        maxQty: s(qty),
        entryQtyTotal: s(qty),
        entryValueTotal: s(gross),
        exitQtyTotal: "0",
        exitValueTotal: "0",
        entryOrderId: orderId,
        initialStop: sl ? s(sl) : null,
        initialTarget: tp ? s(tp) : null,
        plan: entryOrder.plan,
        highWhileOpen: price.toNumber(),
        lowWhileOpen: price.toNumber(),
        exitRoles: [],
      };
      tx.emit({ type: "POSITION_OPENED", t, payload: { position, markPrice: mark } });
    } else {
      const newQty = D(pos.qty).plus(qty);
      const newAvg = moneyRound(D(pos.avgEntry).times(pos.qty).plus(price.times(qty)).div(newQty));
      tx.emit({ type: "POSITION_UPDATED", t, payload: { positionId: pos.id, qty: s(newQty), avgEntry: s(newAvg), markPrice: mark, fillId } });
    }
    syncBracketLegs(tx, orderId, snap, t);
  } else if (pos) {
    const pnl = moneyRound(price.minus(pos.avgEntry).times(qty));
    tx.emit({ type: "REALIZED_PNL", t, payload: { positionId: pos.id, fillId, qty: s(qty), entryPrice: pos.avgEntry, exitPrice: s(price), amount: s(pnl) } });
    const left = D(pos.qty).minus(qty);
    if (left.lte(0)) {
      tx.emit({ type: "POSITION_CLOSED", t, payload: { positionId: pos.id, markPrice: mark, fillId } });
      cancelSiblings(tx, o, t);
      for (const id of activeOrderIds(tx.state)) {
        const x = tx.state.orders[id];
        if (x.side === "SELL") tx.emit({ type: "ORDER_CANCELLED", t, payload: { orderId: id, reason: "Position closed" } });
      }
    } else {
      tx.emit({ type: "POSITION_UPDATED", t, payload: { positionId: pos.id, qty: s(left), avgEntry: pos.avgEntry, markPrice: mark, fillId } });
      cancelSiblings(tx, o, t);
    }
  }
}

/** Evaluate one active order against a snapshot (trigger → fill). */
function evaluateOrder(tx: Tx, orderId: string, snap: MarketSnapshot) {
  const o0 = tx.state.orders[orderId];
  if (!o0 || !isActive(o0)) return;
  const t = snap.t;
  if (o0.expiresAt !== null && t > o0.expiresAt) {
    tx.emit({ type: "ORDER_EXPIRED", t, payload: { orderId, reason: "Day order expired at 23:59:59 UTC" } });
    return;
  }
  if (o0.status === "CREATED") {
    // deferred arrival (replay): the order meets the market for the first time now
    tx.emit({ type: "ORDER_ACCEPTED", t, payload: { orderId, marketableOnArrival: isMarketable(o0, snap) } });
  }
  const ref = refPrice(snap, o0.side);
  const notional = D(o0.qty).minus(o0.filledQty).times(ref).toNumber();
  const bps = slippageBps(tx.state.settings, notional, snap);

  // Stop activation (spec §95/§96)
  if ((o0.type === "STOP" || o0.type === "STOP_LIMIT") && o0.triggeredAt === null && o0.stopPrice) {
    const hit = o0.side === "BUY" ? ref.gte(o0.stopPrice) : ref.lte(o0.stopPrice);
    if (!hit) return;
    const becomes = o0.type === "STOP" ? "MARKET" : "LIMIT";
    const marketable = becomes === "MARKET" ? true : isMarketable(o0, snap);
    tx.emit({ type: "ORDER_TRIGGERED", t, payload: { orderId, stopPrice: o0.stopPrice, observedPrice: s(ref), becomes, marketable } });
  }
  const o = tx.state.orders[orderId];
  if (o.type === "MARKET" || (o.type === "STOP" && o.triggeredAt !== null)) {
    fillOrder(tx, orderId, applySlippage(ref, o.side, bps), ref, bps, "TAKER", snap);
    return;
  }
  if ((o.type === "LIMIT" || (o.type === "STOP_LIMIT" && o.triggeredAt !== null)) && o.limitPrice) {
    const lim = D(o.limitPrice);
    const crosses = o.side === "BUY" ? ref.lte(lim) : ref.gte(lim);
    if (!crosses) return;
    if (o.marketableOnArrival) {
      const p = applySlippage(ref, o.side, bps);
      const capped = o.side === "BUY" ? Dec.min(p, lim) : Dec.max(p, lim);
      fillOrder(tx, orderId, capped, ref, bps, "TAKER", snap);
    } else {
      fillOrder(tx, orderId, lim, lim, 0, "MAKER", snap);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Real-time simulation loop (spec §270)                               */

export interface TickOptions {
  /** Record a PRICE_MARKED event on every tick (replay: one per candle). */
  markEveryTick?: boolean;
  /** Never record a PRICE_MARKED event for this tick (intrabar replay path, candle sweeps). */
  noMark?: boolean;
}

/**
 * 1 receive update → 2 update price → 3 evaluate open orders → 4 trigger →
 * 5 simulate fills → 6 fees → 7 positions → 8 equity → 9 SL/TP legs created this
 * tick → 10 risk limits → 11 record events → (12 UI updates from returned state).
 * Out-of-order snapshots (older than the last processed one) are ignored.
 */
export function processTick(state: AccountState, snap: MarketSnapshot, opts: TickOptions = {}): CommandResult {
  if (!state.initialized || !(snap.price > 0) || !Number.isFinite(snap.price)) return { events: [], state };
  if (state.lastPriceT !== null && snap.t < state.lastPriceT) return { events: [], state };
  const tx = new Tx(state);
  const initial = activeOrderIds(state).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const id of initial) evaluateOrder(tx, id, snap);
  // step 9: legs created by fills in this tick are evaluated against the same snapshot
  const seen = new Set(initial);
  for (let pass = 0; pass < 3; pass++) {
    const fresh = activeOrderIds(tx.state).filter((id) => !seen.has(id));
    if (!fresh.length) break;
    for (const id of fresh) {
      seen.add(id);
      evaluateOrder(tx, id, snap);
    }
  }
  // step 10: risk limits
  const risk = tx.state.settings.risk;
  const today = dayOf(snap.t);
  if (risk.maxDailyLossPct > 0 && tx.state.dailyLossBreachedDay !== today) {
    const eq = equityAt(tx.state, D(snap.price)).toNumber();
    const start = tx.state.dayKey === today ? tx.state.dayStartEquity : tx.state.equityCurve.length ? tx.state.equityCurve[tx.state.equityCurve.length - 1].equity : null;
    if (start && start > 0 && ((start - eq) / start) * 100 >= risk.maxDailyLossPct) {
      tx.emit({ type: "RISK_LIMIT_BREACHED", t: snap.t, payload: { limit: "DAILY_LOSS", detail: `Daily loss ${(((start - eq) / start) * 100).toFixed(2)}% ≥ limit ${risk.maxDailyLossPct}%` } });
      for (const id of activeOrderIds(tx.state)) {
        const o = tx.state.orders[id];
        if (o.side === "BUY") tx.emit({ type: "ORDER_CANCELLED", t: snap.t, payload: { orderId: id, reason: "Daily loss limit reached — entry orders cancelled" } });
      }
    }
  }
  // step 8/11: mark-to-market for the equity curve
  const curveChanged = tx.state.equityCurve.length !== state.equityCurve.length;
  if (!curveChanged && !opts.noMark) {
    const last = tx.state.equityCurve[tx.state.equityCurve.length - 1];
    const inPos = !!tx.state.position;
    const interval = inPos ? MARK_INTERVAL_IN_POSITION_MS : MARK_INTERVAL_FLAT_MS;
    const moved = inPos && last ? (Math.abs(snap.price - last.price) / last.price) * 100 >= MARK_MOVE_PCT : false;
    const due = tx.state.lastMarkT === null || snap.t - tx.state.lastMarkT >= interval;
    if (opts.markEveryTick || due || moved || !last) {
      tx.emit({ type: "PRICE_MARKED", t: snap.t, payload: { price: s(moneyRound(D(snap.price))), source: snap.source ?? null } });
    }
  }
  return { events: tx.events, state: tx.state };
}

/** Engine assumptions surfaced in the UI (spec §54, §101). */
export function describeAssumptions(settings: AccountSettings): string[] {
  const s1 = settings.slippage;
  const r = settings.risk;
  return [
    "All balances, orders and fills are SIMULATED. Nothing is sent to an exchange.",
    "Long-only: sells can only reduce a held XRP position; short selling is not supported in v1.",
    `Market & stop orders fill at the captured ask (buy) / bid (sell) — or last price when no quote is available — ± ${s1.fixedBps} bps fixed slippage${s1.sizeBpsPer100k ? ` + ${s1.sizeBpsPer100k} bps per $100k notional` : ""}${s1.volatilityFactor ? ` + ${s1.volatilityFactor}× recent volatility (bps)` : ""}, capped at ${s1.maxBps} bps.`,
    `Fees: ${settings.fees.takerPct}% taker (market, stop, marketable limit) and ${settings.fees.makerPct}% maker (resting limit fills at the limit price). Every fill stores fee rate, amount and source.`,
    "Limit orders fill when the snapshot crosses the limit (buy: ask ≤ limit; sell: bid ≥ limit). Stops trigger on the quote; gaps fill through the stop.",
    r.maxFillQtyPerTick ? `Partial fills: at most ${r.maxFillQtyPerTick} XRP per order per market update.` : "No liquidity cap: orders fill fully on the first eligible update (real markets may fill partially).",
    "Attached stop-loss / take-profit legs are OCO: the first leg to fill cancels the other.",
    "Fills never use future prices — only the market snapshot captured at that moment.",
  ];
}
