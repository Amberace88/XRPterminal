"use client";

import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { ClaimLabel } from "@/components/ui/Misc";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useMarket } from "@/components/providers/MarketProvider";
import { useDailyHistory } from "@/hooks/useMarketData";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { stressScenarios } from "@/lib/portfolio/holdings";

/** Hypothetical: apply XRP's worst historical 1D / 7D / 30D moves to today's XRP holdings. */
export function StressTestPanel({ xrp, className }: { xrp: number; className?: string }) {
  const h = useDailyHistory("XRP-USD");
  const { ticker, toDisplay, currency } = useMarket();
  const value = ticker ? xrp * ticker.price : null;
  const rows = useMemo(() => (h.data && value !== null ? stressScenarios(h.data.candles, value, [1, 7, 30]) : []), [h.data, value]);
  return (
    <Card className={className}>
      <CardHeader
        title="Stress test"
        icon={<Gauge className="h-4 w-4" />}
        subtitle="Worst historical XRP moves applied to current XRP holdings"
        actions={<ClaimLabel kind="SCENARIO" />}
        info="Close-to-close worst k-day return in the full daily history. Hypothetical: history does not predict the future, and tokens / other assets are not included."
      />
      <CardBody>
        {h.error && !h.data ? (
          <ErrorState compact message={h.error.message} onRetry={h.reload} lastUpdated={h.updatedAt} />
        ) : !h.data ? (
          <SkeletonRows rows={3} />
        ) : value === null ? (
          <p className="text-xs text-fg-muted">XRP price unavailable — cannot value holdings.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.windowDays} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-fg">Worst {r.windowDays === 1 ? "1-day" : `${r.windowDays}-day`} move</p>
                  <p className="text-2xs text-fg-muted">
                    {formatDate(r.startT, "UTC")} → {formatDate(r.endT, "UTC")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-semibold text-danger">{formatPct(r.returnPct)}</p>
                  <p className="num text-2xs text-fg-muted">
                    {formatMoney(toDisplay(r.hypotheticalLoss), currency)} → {formatMoney(toDisplay(r.valueAfter), currency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness provenance={h.data?.provenance} kind="daily" />
        <span>Hypothetical — not a forecast</span>
      </CardFooter>
    </Card>
  );
}
