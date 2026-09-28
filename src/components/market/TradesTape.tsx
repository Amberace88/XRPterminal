"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { EmptyState } from "@/components/ui/States";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatNumber, formatPrice, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

const VENUE_NAME: Record<string, string> = { coinbase: "Coinbase XRP-USD", kraken: "Kraken XRP/USD", binance: "Binance XRP/USDT (USD proxy)" };

/** Live recent trades from the global XRP/USD stream (venue labelled). */
export function TradesTape({ pairLabel, className }: { pairLabel: string; className?: string }) {
  const { trades, venue, streaming, status } = useMarket();
  const isUsd = pairLabel === "XRP/USD";
  const last = trades[0]?.time ?? null;
  const venueName = venue ? VENUE_NAME[venue] ?? venue : "—";
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Recent trades"
        subtitle={`${venueName} · WebSocket`}
        info="Individual trades printed on the connected venue. One venue only — other exchanges trade at slightly different prices."
        actions={<DataFreshness status={streaming && trades.length ? "LIVE" : status === "UNAVAILABLE" ? "UNAVAILABLE" : undefined} timestamp={last} streaming={streaming} />}
      />
      <CardBody className="flex-1 pt-2">
        {!isUsd && (
          <p className="mb-2 rounded-md bg-surface-hover/60 px-2 py-1.5 text-2xs text-fg-muted">
            The trade tape streams XRP/USD only. Showing XRP/USD trades while {pairLabel} is selected.
          </p>
        )}
        {!trades.length ? (
          <EmptyState
            title={streaming ? "Waiting for trades…" : "Trade stream not connected"}
            description={streaming ? "Trades appear here as they print on the venue." : "No live venue stream is available right now; prices fall back to REST polling, which has no trade tape."}
            className="py-6"
          />
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <table className="num w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left">
                  <th scope="col" className="label py-1 font-medium">
                    Time (UTC)
                  </th>
                  <th scope="col" className="label py-1 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="label py-1 text-right font-medium">
                    Size (XRP)
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 40).map((t) => (
                  <tr key={t.id + t.time} className="border-b border-border-subtle/40 last:border-0">
                    <td className="py-[3px] text-fg-muted">{formatTime(t.time, "UTC")}</td>
                    <td className={cn("py-[3px] text-right", t.side === "buy" ? "text-success" : "text-danger")}>{formatPrice(t.price, "USD")}</td>
                    <td className="py-[3px] text-right text-fg-secondary">{formatNumber(t.size, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
      <CardFooter>
        <span>Colour = taker side (green buy / red sell)</span>
        <span>{trades.length ? `${Math.min(40, trades.length)} latest` : ""}</span>
      </CardFooter>
    </Card>
  );
}
