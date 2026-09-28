"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { Skeleton } from "@/components/ui/States";
import { formatAge, formatNumber, formatPrice } from "@/lib/format";
import { bookMetrics, cumulative, type BookState } from "@/lib/analytics/orderbook";
import { cn } from "@/lib/utils/cn";
import type { DataStatus } from "@/lib/types/market";
import type { BookStatus } from "./useKrakenBook";

const STATUS_MAP: Record<BookStatus, DataStatus> = { live: "LIVE", stale: "STALE", connecting: "UNAVAILABLE", unavailable: "UNAVAILABLE" };

/** Order book with cumulative depth bars + depth curve (Kraken WS v2). */
export function OrderBook({
  book,
  status,
  error,
  lastMsg,
  quote,
  symbol,
  onRetry,
  className,
}: {
  book: BookState | null;
  status: BookStatus;
  error: string | null;
  lastMsg: number | null;
  quote: string;
  symbol: string;
  onRetry: () => void;
  className?: string;
}) {
  const m = useMemo(() => bookMetrics(book), [book]);
  const bids = useMemo(() => cumulative(book?.bids ?? []), [book]);
  const asks = useMemo(() => cumulative(book?.asks ?? []), [book]);
  const maxCum = Math.max(bids[bids.length - 1]?.cum ?? 0, asks[asks.length - 1]?.cum ?? 0) || 1;
  const priceDigits = quote === "BTC" || quote === "ETH" ? 8 : undefined;
  const fp = (v: number | null) => formatPrice(v, quote, priceDigits);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Order book"
        subtitle={`Kraken ${symbol} · top ${book?.depth ?? 10} levels per side`}
        info="Live order book from Kraken's public WebSocket (v2). Shows visible limit orders on one venue only — not the whole market."
        actions={
          <DataFreshness
            status={STATUS_MAP[status]}
            timestamp={lastMsg}
            streaming={status === "live"}
            provenance={lastMsg ? { source: `Kraken ${symbol} order book (WebSocket v2)`, provider: "kraken", timestamp: lastMsg, fetchedAt: lastMsg } : null}
          />
        }
      />
      <CardBody className="flex-1">
        {status === "unavailable" && !book ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-medium text-fg">Order book unavailable</p>
            <p className="max-w-xs text-xs text-fg-muted">{error ?? "The venue stream could not be reached from this browser."} No depth is shown rather than stale or estimated data.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : !book ? (
          <div className="space-y-1.5" role="status" aria-label="Connecting to order book">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
            <p className="pt-1 text-center text-2xs text-fg-muted">Connecting to Kraken…</p>
          </div>
        ) : (
          <>
            <DepthCurve bids={bids} asks={asks} />
            <div className="mt-3 grid grid-cols-3 px-1 pb-1 text-2xs text-fg-muted">
              <span className="label">Price ({quote})</span>
              <span className="label text-right">Size (XRP)</span>
              <span className="label text-right">Total</span>
            </div>
            <div className="num text-xs" role="table" aria-label="Asks">
              {[...asks].reverse().map((l) => (
                <Row key={`a${l.price}`} price={fp(l.price)} qty={l.qty} cum={l.cum} max={maxCum} side="ask" />
              ))}
            </div>
            <div className="my-1 flex items-center justify-between rounded-md bg-surface-hover/60 px-2 py-1.5 text-2xs">
              <span className="text-fg-muted">
                Spread <span className="num text-fg">{m.spread !== null ? fp(m.spread) : "—"}</span>
              </span>
              <span className="num text-fg-secondary">{m.spreadPct !== null ? `${m.spreadPct.toFixed(3)}%` : "—"}</span>
              <span className="text-fg-muted">
                Mid <span className="num text-fg">{fp(m.mid)}</span>
              </span>
            </div>
            <div className="num text-xs" role="table" aria-label="Bids">
              {bids.map((l) => (
                <Row key={`b${l.price}`} price={fp(l.price)} qty={l.qty} cum={l.cum} max={maxCum} side="bid" />
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs">
              <dt className="text-fg-muted">Bid depth ±1%</dt>
              <dd className="num text-right text-fg">{m.depth1PctBid !== null ? `${formatNumber(m.depth1PctBid, quote === "BTC" || quote === "ETH" ? 4 : 0)} ${quote}` : "—"}</dd>
              <dt className="text-fg-muted">Ask depth ±1%</dt>
              <dd className="num text-right text-fg">{m.depth1PctAsk !== null ? `${formatNumber(m.depth1PctAsk, quote === "BTC" || quote === "ETH" ? 4 : 0)} ${quote}` : "—"}</dd>
              <dt className="text-fg-muted">Visible imbalance</dt>
              <dd className={cn("num text-right", (m.imbalance ?? 0) > 0 ? "text-success" : (m.imbalance ?? 0) < 0 ? "text-danger" : "text-fg")}>
                {m.imbalance !== null ? `${(m.imbalance * 100).toFixed(1)}% ${m.imbalance >= 0 ? "bid" : "ask"}` : "—"}
              </dd>
            </dl>
            {m.crossed && <p className="mt-2 text-2xs text-warning">Book appears crossed — resynchronising may be required.</p>}
          </>
        )}
      </CardBody>
      <CardFooter>
        <span>
          {status === "live" ? "Streaming" : status === "stale" ? `Stream interrupted · last update ${formatAge(lastMsg)}` : status === "connecting" ? "Connecting" : "Unavailable"}
        </span>
        <span>Single venue · visible levels only</span>
      </CardFooter>
    </Card>
  );
}

function Row({ price, qty, cum, max, side }: { price: string; qty: number; cum: number; max: number; side: "bid" | "ask" }) {
  return (
    <div className="relative grid grid-cols-3 items-center px-1 py-[3px]" role="row">
      <span
        className={cn("absolute inset-y-0 right-0 rounded-sm", side === "bid" ? "bg-success/10" : "bg-danger/10")}
        style={{ width: `${(cum / max) * 100}%` }}
        aria-hidden
      />
      <span className={cn("relative", side === "bid" ? "text-success" : "text-danger")} role="cell">
        {price}
      </span>
      <span className="relative text-right text-fg-secondary" role="cell">
        {formatNumber(qty, 0)}
      </span>
      <span className="relative text-right text-fg-muted" role="cell">
        {formatNumber(cum, 0)}
      </span>
    </div>
  );
}

/** Step depth curve (SVG): cumulative bid volume left of mid, asks right. */
function DepthCurve({ bids, asks }: { bids: { price: number; cum: number }[]; asks: { price: number; cum: number }[] }) {
  if (!bids.length || !asks.length) return null;
  const W = 300;
  const H = 70;
  const lo = bids[bids.length - 1].price;
  const hi = asks[asks.length - 1].price;
  const span = hi - lo || 1;
  const maxC = Math.max(bids[bids.length - 1].cum, asks[asks.length - 1].cum) || 1;
  const x = (p: number) => ((p - lo) / span) * W;
  const y = (c: number) => H - (c / maxC) * (H - 4);
  let bidPath = `M${x(bids[0].price)},${H}`;
  bids.forEach((b) => (bidPath += ` L${x(b.price)},${y(b.cum)}`));
  bidPath += ` L${x(lo)},${H} Z`;
  let askPath = `M${x(asks[0].price)},${H}`;
  asks.forEach((a) => (askPath += ` L${x(a.price)},${y(a.cum)}`));
  askPath += ` L${x(hi)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Cumulative depth curve">
      <path d={bidPath} style={{ fill: "rgb(var(--success) / 0.15)", stroke: "rgb(var(--success))" }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={askPath} style={{ fill: "rgb(var(--danger) / 0.15)", stroke: "rgb(var(--danger))" }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
