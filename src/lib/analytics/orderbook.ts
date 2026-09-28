/**
 * Order-book state & metrics for the Kraken WebSocket v2 "book" channel.
 * Pure functions (no I/O) so they can be unit-tested; the socket lives in the client component.
 *
 * Message shape (docs.kraken.com, WS v2):
 *   { channel: "book", type: "snapshot" | "update",
 *     data: [{ symbol, bids: [{ price, qty }], asks: [{ price, qty }], checksum, timestamp? }] }
 * An update with qty = 0 removes the level. After each update the book is truncated to the subscribed depth.
 */

export interface BookLevel {
  price: number;
  qty: number;
}

export interface BookState {
  symbol: string;
  bids: BookLevel[]; // descending price
  asks: BookLevel[]; // ascending price
  depth: number;
  updatedAt: number;
}

export interface BookMessageData {
  symbol?: string;
  bids?: { price: number | string; qty: number | string }[];
  asks?: { price: number | string; qty: number | string }[];
  timestamp?: string;
}

const toLevels = (arr: BookMessageData["bids"]): BookLevel[] =>
  (arr ?? [])
    .map((l) => ({ price: Number(l.price), qty: Number(l.qty) }))
    .filter((l) => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.qty) && l.qty >= 0);

export function bookFromSnapshot(d: BookMessageData, depth: number, now = Date.now()): BookState {
  const bids = toLevels(d.bids).filter((l) => l.qty > 0).sort((a, b) => b.price - a.price).slice(0, depth);
  const asks = toLevels(d.asks).filter((l) => l.qty > 0).sort((a, b) => a.price - b.price).slice(0, depth);
  return { symbol: d.symbol ?? "", bids, asks, depth, updatedAt: d.timestamp ? Date.parse(d.timestamp) || now : now };
}

function applySide(side: BookLevel[], changes: BookLevel[], desc: boolean, depth: number): BookLevel[] {
  const m = new Map(side.map((l) => [l.price, l.qty]));
  for (const c of changes) {
    if (c.qty === 0) m.delete(c.price);
    else m.set(c.price, c.qty);
  }
  return [...m.entries()]
    .map(([price, qty]) => ({ price, qty }))
    .sort((a, b) => (desc ? b.price - a.price : a.price - b.price))
    .slice(0, depth);
}

export function applyBookUpdate(state: BookState, d: BookMessageData, now = Date.now()): BookState {
  return {
    ...state,
    bids: applySide(state.bids, toLevels(d.bids), true, state.depth),
    asks: applySide(state.asks, toLevels(d.asks), false, state.depth),
    updatedAt: d.timestamp ? Date.parse(d.timestamp) || now : now,
  };
}

export interface BookMetrics {
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spread: number | null;
  spreadPct: number | null;
  /** Quote-currency notional of visible levels within ±1% of mid. */
  depth1PctBid: number | null;
  depth1PctAsk: number | null;
  /** (bidQty − askQty) / (bidQty + askQty) over visible levels, −1…+1. */
  imbalance: number | null;
  crossed: boolean;
}

export function bookMetrics(b: BookState | null): BookMetrics {
  const bestBid = b?.bids[0]?.price ?? null;
  const bestAsk = b?.asks[0]?.price ?? null;
  if (!b || bestBid === null || bestAsk === null)
    return { bestBid, bestAsk, mid: null, spread: null, spreadPct: null, depth1PctBid: null, depth1PctAsk: null, imbalance: null, crossed: false };
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const lo = mid * 0.99;
  const hi = mid * 1.01;
  const dBid = b.bids.filter((l) => l.price >= lo).reduce((s, l) => s + l.price * l.qty, 0);
  const dAsk = b.asks.filter((l) => l.price <= hi).reduce((s, l) => s + l.price * l.qty, 0);
  const qb = b.bids.reduce((s, l) => s + l.qty, 0);
  const qa = b.asks.reduce((s, l) => s + l.qty, 0);
  return {
    bestBid,
    bestAsk,
    mid,
    spread,
    spreadPct: (spread / mid) * 100,
    depth1PctBid: dBid,
    depth1PctAsk: dAsk,
    imbalance: qb + qa > 0 ? (qb - qa) / (qb + qa) : null,
    crossed: spread < 0,
  };
}

/** Cumulative quantities for depth visualization (bids from best down, asks from best up). */
export function cumulative(levels: BookLevel[]): (BookLevel & { cum: number })[] {
  let c = 0;
  return levels.map((l) => {
    c += l.qty;
    return { ...l, cum: c };
  });
}
