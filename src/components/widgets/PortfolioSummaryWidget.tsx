"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Delta } from "@/components/ui/MetricCard";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useMarket } from "@/components/providers/MarketProvider";
import { useDailyHistory } from "@/hooks/useMarketData";
import { formatMoney, formatSignedMoney, formatXrp } from "@/lib/format";
import { periodChangeAtCurrentHoldings } from "@/lib/portfolio/holdings";
import { useAggregate, useConnectedAccounts, useHoldings } from "@/components/portfolio/usePortfolio";

/** Dashboard widget: total portfolio value, XRP amount and daily change at current holdings. */
export function PortfolioSummaryWidget({ className }: { className?: string }) {
  const acc = useConnectedAccounts();
  const hold = useHoldings(acc.accounts);
  const agg = useAggregate(hold.holdings);
  const { ticker, toDisplay, currency } = useMarket();
  const hist = useDailyHistory("XRP-USD");
  const price = ticker?.price ?? null;
  const day = useMemo(() => (hist.data && price ? periodChangeAtCurrentHoldings(hist.data.candles, agg.xrp, price, 1) : null), [hist.data, price, agg.xrp]);
  const empty = acc.accounts !== null && acc.accounts.length === 0;
  const loading = acc.accounts === null || (hold.loading && !hold.updatedAt);
  return (
    <Card className={className}>
      <CardHeader
        title="Portfolio"
        icon={<Wallet className="h-4 w-4" />}
        subtitle="Private · read-only"
        actions={
          <Link href="/portfolio" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody>
        {empty ? (
          <EmptyState
            className="py-5"
            title="No wallet connected yet"
            description="Add a public XRPL address to track its value. No keys, no signing."
            action={
              <ButtonLink href="/portfolio" size="sm">
                Connect a wallet
              </ButtonLink>
            }
          />
        ) : loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="space-y-3">
            <div>
              <p className="label">Total value</p>
              <p className="num text-2xl font-semibold tracking-tight text-fg">{price !== null ? formatMoney(toDisplay(agg.xrp * price), currency) : "—"}</p>
              <p className="num text-xs text-fg-muted">{formatXrp(agg.xrp)}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-xs">
              <span className="text-fg-muted">24h change · at current holdings</span>
              <span className="num">
                {day ? (
                  <>
                    {formatSignedMoney(toDisplay(day.changeValue), currency)} <Delta value={day.changePct} className="ml-1" />
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {agg.accountsFailed > 0 && <p className="text-2xs text-warning">{agg.accountsFailed} account(s) unavailable — values exclude them.</p>}
            {agg.tokens.length > 0 && <p className="text-2xs text-fg-muted">{agg.tokens.length} token balance(s) not valued.</p>}
          </div>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness timestamp={hold.updatedAt} kind="minute" />
        <span>{acc.accounts?.length ?? 0} account(s)</span>
      </CardFooter>
    </Card>
  );
}
