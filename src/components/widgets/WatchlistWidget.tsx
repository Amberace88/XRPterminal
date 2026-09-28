"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { ButtonLink } from "@/components/ui/Button";
import { useTickerRest, type Pair } from "@/hooks/useMarketData";
import { formatPct, formatPrice } from "@/lib/format";
import { useWatchlist } from "@/components/alerts/useAlerts";

function PairRow({ pair, label }: { pair: Pair; label: string }) {
  const { data, loading } = useTickerRest(pair, 60_000);
  const t = data?.ticker;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-fg">{label}</span>
      <span className="num text-xs">
        {loading && !t ? "…" : t ? formatPrice(t.price, t.quote) : "—"}{" "}
        {t && <span className={(t.changePct24h ?? 0) < 0 ? "text-danger" : "text-success"}>{formatPct(t.changePct24h ?? null)}</span>}
      </span>
    </div>
  );
}

/** Dashboard widget: watchlist items with live prices for XRP pairs. */
export function WatchlistWidget({ className }: { className?: string }) {
  const { items, loading, error } = useWatchlist();
  return (
    <Card className={className}>
      <CardHeader
        title="Watchlist"
        icon={<Eye className="h-4 w-4" />}
        subtitle={items ? `${items.length} item${items.length === 1 ? "" : "s"}` : undefined}
        actions={
          <Link href="/alerts" className="text-xs text-accent-strong hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="max-h-[260px] overflow-y-auto">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : !items?.length ? (
          <EmptyState
            title="Nothing watched yet"
            description="Track XRP pairs, wallets, news topics, traders and XRPL entities."
            action={
              <ButtonLink href="/alerts" size="sm" variant="secondary">
                Add items
              </ButtonLink>
            }
            className="py-4"
          />
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 8).map((it) => (
              <li key={it.id}>
                {it.kind === "pair" ? (
                  <PairRow pair={it.value as Pair} label={it.label} />
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-fg">{it.label}</span>
                    <Badge tone="neutral">{it.kind}</Badge>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
