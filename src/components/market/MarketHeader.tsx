"use client";

import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { Delta } from "@/components/ui/MetricCard";
import { DataFreshness, SourceLine } from "@/components/ui/DataFreshness";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { TrustBadge } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/Tooltip";
import { useMarket } from "@/components/providers/MarketProvider";
import { useSnapshot, type Pair } from "@/hooks/useMarketData";
import { useApi } from "@/hooks/useApi";
import { formatCompact, formatCompactMoney, formatNumber, formatPrice, formatXrp } from "@/lib/format";
import type { DataStatus, Ticker } from "@/lib/types/market";

export const MARKET_PAIRS: { value: Pair; label: string; quote: "USD" | "EUR" | "BTC" | "ETH"; kraken: string }[] = [
  { value: "XRP-USD", label: "XRP/USD", quote: "USD", kraken: "XRP/USD" },
  { value: "XRP-EUR", label: "XRP/EUR", quote: "EUR", kraken: "XRP/EUR" },
  { value: "XRP-BTC", label: "XRP/BTC", quote: "BTC", kraken: "XRP/BTC" },
  { value: "XRP-ETH", label: "XRP/ETH", quote: "ETH", kraken: "XRP/ETH" },
];

/** Resolve the ticker for the selected pair: live stream for XRP/USD, REST polling otherwise. */
export function usePairTicker(pair: Pair): { ticker: Ticker | null; status?: DataStatus; streaming: boolean; loading: boolean; error: string | null; reload: () => void; updatedAt: number | null } {
  const live = useMarket();
  const isUsd = pair === "XRP-USD";
  // XRP/USD comes from the global stream; other pairs poll our REST route (no request at all for USD)
  const rest = useApi<{ ticker: Ticker; attempted: string[] }>(isUsd ? null : `/api/market/ticker?pair=${pair}`, { refreshMs: 15_000, staleMs: 10_000 });
  if (isUsd)
    return {
      ticker: live.ticker,
      status: live.status,
      streaming: live.streaming,
      loading: !live.ticker,
      error: null,
      reload: () => undefined,
      updatedAt: live.ticker?.provenance.fetchedAt ?? null,
    };
  return {
    ticker: rest.data?.ticker ?? null,
    status: undefined,
    streaming: false,
    loading: rest.loading && !rest.data,
    error: rest.error?.message ?? null,
    reload: rest.reload,
    updatedAt: rest.updatedAt,
  };
}

export function MarketHeader({ pair }: { pair: Pair }) {
  const meta = MARKET_PAIRS.find((p) => p.value === pair) ?? MARKET_PAIRS[0];
  const t = usePairTicker(pair);
  const snap = useSnapshot("XRP");
  const tk = t.ticker;
  const q = meta.quote;
  const dp = q === "BTC" || q === "ETH" ? 8 : undefined;
  const spread = tk?.bid && tk?.ask ? tk.ask - tk.bid : null;
  const spreadPct = spread !== null && tk?.bid && tk?.ask ? (spread / ((tk.ask + tk.bid) / 2)) * 100 : null;

  return (
    <Card className="animate-fade-up">
      <CardBody className="pt-4 sm:pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{meta.label}</span>
              <DataFreshness status={t.status} provenance={tk?.provenance} streaming={t.streaming} showSource />
            </div>
            {t.loading ? (
              <Skeleton className="mt-2 h-10 w-52" />
            ) : t.error && !tk ? (
              <ErrorState compact message={t.error} onRetry={t.reload} lastUpdated={t.updatedAt} className="items-start px-0 text-left" />
            ) : (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{formatPrice(tk?.price, q, dp)}</span>
                <Delta value={tk?.changePct24h} className="text-base font-medium" />
                <span className="num text-sm text-fg-muted">
                  {tk?.change24h !== undefined && Number.isFinite(tk.change24h) ? `${tk.change24h >= 0 ? "+" : ""}${formatPrice(tk.change24h, q, dp)}` : ""} 24h
                </span>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <HStat label="24h high" value={formatPrice(tk?.high24h, q, dp)} loading={t.loading} />
            <HStat label="24h low" value={formatPrice(tk?.low24h, q, dp)} loading={t.loading} />
            <HStat label="24h volume" value={tk?.volume24hBase ? formatXrp(tk.volume24hBase, { compact: true }) : "—"} loading={t.loading} />
            <HStat label="Bid" value={formatPrice(tk?.bid, q, dp)} loading={t.loading} />
            <HStat label="Ask" value={formatPrice(tk?.ask, q, dp)} loading={t.loading} />
            <HStat
              label="Spread"
              value={spreadPct !== null ? `${spreadPct.toFixed(3)}%` : "—"}
              loading={t.loading}
              info="Best ask minus best bid, relative to the mid price, on the displayed venue."
            />
          </dl>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 sm:grid-cols-4">
          <HStat label="Market cap (USD)" value={formatCompactMoney(snap.data?.marketCapUsd, "USD")} loading={snap.loading && !snap.data} external />
          <HStat label="Circulating supply" value={snap.data?.circulatingSupply ? `${formatCompact(snap.data.circulatingSupply)} XRP` : "—"} loading={snap.loading && !snap.data} external />
          <HStat label="Total supply" value={snap.data?.totalSupply ? `${formatCompact(snap.data.totalSupply)} XRP` : "—"} loading={snap.loading && !snap.data} external />
          <HStat label="Market cap rank" value={snap.data?.rank ? `#${formatNumber(snap.data.rank, 0)}` : "—"} loading={snap.loading && !snap.data} external />
        </div>
      </CardBody>
      <CardFooter className="flex-wrap">
        <SourceLine provenance={tk?.provenance} />
        <span className="flex items-center gap-1.5">
          <TrustBadge kind="EXTERNAL" /> Market cap & supply: CoinGecko{snap.data ? ` · ${new Date(snap.data.provenance.timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
          {snap.error && !snap.data ? " · unavailable" : ""}
        </span>
      </CardFooter>
    </Card>
  );
}

function HStat({ label, value, loading, info, external }: { label: string; value: React.ReactNode; loading?: boolean; info?: string; external?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label flex items-center gap-1">
        {label}
        {info && <InfoTip text={info} />}
        {external && <span className="sr-only">(external source: CoinGecko)</span>}
      </dt>
      <dd className="num mt-0.5 truncate font-medium text-fg">{loading ? <Skeleton className="h-5 w-20" /> : value}</dd>
    </div>
  );
}
