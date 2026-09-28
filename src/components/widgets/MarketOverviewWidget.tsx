"use client";

import Link from "next/link";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Delta } from "@/components/ui/MetricCard";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { Skeleton } from "@/components/ui/States";
import { Sparkline } from "@/components/charts/Sparkline";
import { useMarket } from "@/components/providers/MarketProvider";
import { useApi } from "@/hooks/useApi";
import { formatMoney, formatPrice, formatXrp } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";

/** Dashboard widget: live XRP/USD price, 24h change, sparkline and 24h range/volume (spec §19). */
export function MarketOverviewWidget({ className }: { className?: string }) {
  const { ticker, status, streaming, priceHistory, currency, toDisplay, fx } = useMarket();
  const useStream = priceHistory.length >= 30;
  // fall back to 48 × 1h candles until the stream has accumulated enough points
  const candles = useApi<CandleSeries>(useStream ? null : "/api/market/candles?pair=XRP-USD&tf=1h&limit=48", { refreshMs: 120_000, staleMs: 60_000 });
  const spark = useStream ? priceHistory.map((p) => p.p) : (candles.data?.candles ?? []).map((c) => c.c);
  const sparkLabel = useStream ? "live session" : candles.data ? "48h · 1h candles" : "";
  const range = ticker?.high24h && ticker?.low24h && ticker.high24h > ticker.low24h ? ((ticker.price - ticker.low24h) / (ticker.high24h - ticker.low24h)) * 100 : null;
  const converted = currency !== "USD" && ticker ? toDisplay(ticker.price) : null;

  return (
    <Card className={className}>
      <CardHeader
        title="XRP / USD"
        subtitle={ticker ? ticker.provenance.source : "Connecting to market data…"}
        actions={
          <Link href="/market" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody>
        {!ticker ? (
          <div className="space-y-2" role="status" aria-label="Loading price">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="num text-3xl font-semibold tracking-tight text-fg">{formatPrice(ticker.price, "USD")}</div>
                <div className="mt-0.5 flex items-center gap-2 text-sm">
                  <Delta value={ticker.changePct24h} />
                  <span className="text-2xs text-fg-muted">24h</span>
                  {converted !== null && (
                    <span className="num text-2xs text-fg-muted" title={fx ? `ECB reference rate via ${fx.provenance.source}` : undefined}>
                      ≈ {formatPrice(converted, currency)}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {spark.length > 1 ? <Sparkline values={spark} width={120} height={40} /> : <Skeleton className="h-10 w-[120px]" />}
                <div className="text-[10px] text-fg-muted">{sparkLabel}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-2xs text-fg-muted">
                <span>24h low</span>
                <span>24h high</span>
              </div>
              <div className="relative mt-1 h-1.5 rounded-full bg-surface-hover" aria-label="Position within 24h range">
                {range !== null && <span className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded bg-accent" style={{ left: `calc(${Math.max(0, Math.min(100, range))}% - 2px)` }} />}
              </div>
              <div className="num mt-1 flex justify-between text-xs text-fg-secondary">
                <span>{formatPrice(ticker.low24h, "USD")}</span>
                <span>{formatPrice(ticker.high24h, "USD")}</span>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="label">24h volume</dt>
                <dd className="num text-fg">{ticker.volume24hBase ? formatXrp(ticker.volume24hBase, { compact: true }) : "—"}</dd>
              </div>
              <div className="text-right">
                <dt className="label">Quote volume</dt>
                <dd className="num text-fg">{ticker.volume24hQuote ? formatMoney(ticker.volume24hQuote, "USD", 0) : "—"}</dd>
              </div>
            </dl>
          </>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness status={status} provenance={ticker?.provenance} streaming={streaming} />
        <span>Single venue</span>
      </CardFooter>
    </Card>
  );
}
