"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { useDailyHistory } from "@/hooks/useMarketData";
import { computeRegime, type Regime } from "@/lib/analytics/regime";
import { formatDate } from "@/lib/format";

export const REGIME_TONE: Record<Regime, "success" | "danger" | "neutral" | "warning" | "info" | "accent"> = {
  "TRENDING UP": "success",
  "TRENDING DOWN": "danger",
  RANGE: "neutral",
  "HIGH VOLATILITY": "warning",
  "LOW VOLATILITY": "info",
  TRANSITION: "accent",
  UNKNOWN: "neutral",
};

/** Dashboard widget: current market regime, its measurable inputs and a plain explanation (spec §23). */
export function RegimeWidget({ className }: { className?: string }) {
  const h = useDailyHistory("XRP-USD");
  const r = useMemo(() => (h.data ? computeRegime(h.data.candles) : null), [h.data]);
  return (
    <Card className={className}>
      <CardHeader
        title="Market regime"
        info={GLOSSARY.regime}
        subtitle="XRP/USD · daily"
        actions={
          <Link href="/market#health" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody>
        {h.error && !r ? (
          <ErrorState compact message={h.error.message} onRetry={h.reload} lastUpdated={h.updatedAt} />
        ) : !r ? (
          <SkeletonRows rows={5} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={REGIME_TONE[r.regime]} className="px-2 py-1 text-xs">
                {r.regime}
              </Badge>
              <span className="text-2xs text-fg-muted">as of {formatDate(r.asOf, "UTC")}</span>
            </div>
            {r.inputs.length > 0 && (
              <dl className="mt-3 divide-y divide-border-subtle/60 text-xs">
                {r.inputs.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="text-fg-muted">{i.name}</dt>
                    <dd className="num text-right text-fg">
                      {i.value} <span className="text-2xs text-fg-muted">{i.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-2xs leading-relaxed text-fg-secondary">{r.explanation}</p>
          </>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness provenance={h.data?.provenance} timestamp={h.data?.provenance.fetchedAt} kind="daily" />
        <span>{r?.methodologyVersion ?? ""}</span>
      </CardFooter>
    </Card>
  );
}
