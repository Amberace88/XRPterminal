import Decimal from "decimal.js";
import type { CostMethod, Lot } from "./types";

/**
 * Deterministic cost-basis engine (spec §38) on decimal.js.
 *  - Buy fees are capitalised into cost basis; sell fees reduce proceeds.
 *  - FIFO consumes the oldest open lots first; AVERAGE uses the running average unit cost.
 *  - A sell larger than the recorded open quantity is flagged; only the matched part is realised.
 * All lots must share one quote currency (the caller filters/converts).
 */

export interface OpenLot {
  date: string;
  qty: string;
  unitCost: string;
}

export interface CostBasisResult {
  method: CostMethod;
  remainingQty: string;
  costBasis: string;
  avgCost: string | null;
  realizedPnl: string;
  proceeds: string;
  feesTotal: string;
  boughtQty: string;
  soldQty: string;
  unmatchedSellQty: string;
  marketValue: string | null;
  unrealizedPnl: string | null;
  unrealizedPct: number | null;
  openLots: OpenLot[];
  warnings: string[];
}

const D = (v: string | number) => new Decimal(v || 0);

export function sortLots(lots: Lot[]): Lot[] {
  return [...lots].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

export function validateLot(l: Pick<Lot, "qty" | "price" | "fee" | "date">): string | null {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date)) return "Date must be YYYY-MM-DD";
    if (!D(l.qty).gt(0)) return "Quantity must be greater than 0";
    if (D(l.price).lt(0)) return "Price cannot be negative";
    if (D(l.fee).lt(0)) return "Fee cannot be negative";
    return null;
  } catch {
    return "Invalid number";
  }
}

export function computeCostBasis(lots: Lot[], method: CostMethod, currentPrice?: number | string | null): CostBasisResult {
  const warnings: string[] = [];
  let realized = D(0);
  let proceedsTotal = D(0);
  let fees = D(0);
  let bought = D(0);
  let sold = D(0);
  let unmatched = D(0);
  // FIFO state
  const queue: { date: string; qty: Decimal; unitCost: Decimal }[] = [];
  // AVERAGE state
  let poolQty = D(0);
  let poolCost = D(0);

  for (const l of sortLots(lots)) {
    const qty = D(l.qty);
    const price = D(l.price);
    const fee = D(l.fee);
    fees = fees.plus(fee);
    if (l.side === "buy") {
      bought = bought.plus(qty);
      const cost = qty.times(price).plus(fee);
      if (method === "FIFO") queue.push({ date: l.date, qty, unitCost: cost.div(qty) });
      else {
        poolQty = poolQty.plus(qty);
        poolCost = poolCost.plus(cost);
      }
      continue;
    }
    // sell
    sold = sold.plus(qty);
    const available = method === "FIFO" ? queue.reduce((s, q) => s.plus(q.qty), D(0)) : poolQty;
    const matched = Decimal.min(qty, available);
    if (qty.gt(available)) {
      const diff = qty.minus(available);
      unmatched = unmatched.plus(diff);
      warnings.push(`Sell on ${l.date} exceeds recorded open quantity by ${diff.toFixed()} XRP — only the matched part is realised.`);
    }
    if (matched.lte(0)) continue;
    const proceeds = qty.times(price).minus(fee).times(matched.div(qty));
    proceedsTotal = proceedsTotal.plus(proceeds);
    let costRemoved = D(0);
    if (method === "FIFO") {
      let left = matched;
      while (left.gt(0) && queue.length) {
        const head = queue[0];
        const take = Decimal.min(left, head.qty);
        costRemoved = costRemoved.plus(take.times(head.unitCost));
        head.qty = head.qty.minus(take);
        left = left.minus(take);
        if (head.qty.lte(0)) queue.shift();
      }
    } else {
      const avg = poolCost.div(poolQty);
      costRemoved = avg.times(matched);
      poolQty = poolQty.minus(matched);
      poolCost = poolCost.minus(costRemoved);
      if (poolQty.lte(0)) {
        poolQty = D(0);
        poolCost = D(0);
      }
    }
    realized = realized.plus(proceeds.minus(costRemoved));
  }

  const remainingQty = method === "FIFO" ? queue.reduce((s, q) => s.plus(q.qty), D(0)) : poolQty;
  const costBasis = method === "FIFO" ? queue.reduce((s, q) => s.plus(q.qty.times(q.unitCost)), D(0)) : poolCost;
  const avgCost = remainingQty.gt(0) ? costBasis.div(remainingQty) : null;
  let marketValue: Decimal | null = null;
  let unrealized: Decimal | null = null;
  if (currentPrice !== undefined && currentPrice !== null && Number.isFinite(Number(currentPrice))) {
    marketValue = remainingQty.times(D(currentPrice));
    unrealized = marketValue.minus(costBasis);
  }
  const openLots: OpenLot[] =
    method === "FIFO"
      ? queue.map((q) => ({ date: q.date, qty: q.qty.toFixed(), unitCost: q.unitCost.toFixed() }))
      : remainingQty.gt(0)
        ? [{ date: "pooled", qty: remainingQty.toFixed(), unitCost: avgCost!.toFixed() }]
        : [];

  return {
    method,
    remainingQty: remainingQty.toFixed(),
    costBasis: costBasis.toFixed(),
    avgCost: avgCost ? avgCost.toFixed() : null,
    realizedPnl: realized.toFixed(),
    proceeds: proceedsTotal.toFixed(),
    feesTotal: fees.toFixed(),
    boughtQty: bought.toFixed(),
    soldQty: sold.toFixed(),
    unmatchedSellQty: unmatched.toFixed(),
    marketValue: marketValue ? marketValue.toFixed() : null,
    unrealizedPnl: unrealized ? unrealized.toFixed() : null,
    unrealizedPct: unrealized && costBasis.gt(0) ? unrealized.div(costBasis).times(100).toNumber() : null,
    openLots,
    warnings,
  };
}

export interface Coverage {
  complete: boolean;
  /** "complete" | lots cover less than holdings | lots claim more than holdings */
  state: "complete" | "incomplete" | "exceeds-holdings" | "no-lots";
  holdingsQty: string;
  lotsQty: string;
  diff: string;
  message: string | null;
}

/**
 * Compare lots' open quantity against actual holdings. Tolerance: max(1 XRP, 0.5%) — network fees
 * and reserves make exact equality unrealistic. Anything else → "Cost basis incomplete."
 */
export function costBasisCoverage(result: Pick<CostBasisResult, "remainingQty" | "unmatchedSellQty">, holdingsQty: number | string, hasLots: boolean): Coverage {
  const h = D(holdingsQty);
  const r = D(result.remainingQty);
  const diff = h.minus(r);
  const tol = Decimal.max(1, h.times(0.005));
  if (!hasLots)
    return { complete: false, state: "no-lots", holdingsQty: h.toFixed(), lotsQty: r.toFixed(), diff: diff.toFixed(), message: h.gt(0) ? "Cost basis incomplete." : null };
  if (D(result.unmatchedSellQty).gt(0) || diff.gt(tol))
    return {
      complete: false,
      state: "incomplete",
      holdingsQty: h.toFixed(),
      lotsQty: r.toFixed(),
      diff: diff.toFixed(),
      message: "Cost basis incomplete.",
    };
  if (diff.neg().gt(tol))
    return {
      complete: false,
      state: "exceeds-holdings",
      holdingsQty: h.toFixed(),
      lotsQty: r.toFixed(),
      diff: diff.toFixed(),
      message: "Cost basis incomplete. Recorded lots exceed current holdings — record the missing sells/transfers.",
    };
  return { complete: true, state: "complete", holdingsQty: h.toFixed(), lotsQty: r.toFixed(), diff: diff.toFixed(), message: null };
}
