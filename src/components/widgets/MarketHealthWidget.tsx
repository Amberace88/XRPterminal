"use client";

import Link from "next/link";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { useMarketHealth } from "@/components/market/MarketHealthPanel";
import { PercentileBar, TONE_BADGE, TrendArrow } from "@/components/market/parts";

/** Dashboard widget: compact Market Health (spec §25) — condition, percentile and trend per component. */
export function MarketHealthWidget({ className }: { className?: string }) {
  const { xrp, health } = useMarketHealth(null);
  const rows = health?.components.filter((c) => c.available).slice(0, 6) ?? [];
  return (
    <Card className={className}>
      <CardHeader
        title="Market health"
        subtitle="Condition · historical percentile · trend"
        info="Each component compares today's measurable condition with its own history. Describes the present; not a forecast."
        actions={
          <Link href="/market#health" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="pt-2">
        {xrp.error && !health ? (
          <ErrorState compact message={xrp.error.message} onRetry={xrp.reload} lastUpdated={xrp.updatedAt} />
        ) : !health ? (
          <SkeletonRows rows={6} />
        ) : (
          <ul className="divide-y divide-border-subtle/60" aria-label="Market health components">
            {rows.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-1.5 sm:grid-cols-[1fr_auto_96px_auto]">
                <span className="truncate text-xs text-fg-secondary" title={c.detail}>
                  {c.name}
                </span>
                <Badge tone={TONE_BADGE[c.tone]}>{c.condition}</Badge>
                <span className="hidden sm:block">{c.percentile !== null ? <PercentileBar value={c.percentile} /> : <span className="text-2xs text-fg-muted">—</span>}</span>
                <span className="hidden sm:block">
                  <TrendArrow trend={c.trend} note={c.trendNote} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness provenance={xrp.data?.provenance} timestamp={xrp.data?.provenance.fetchedAt} kind="daily" />
        <span>{health?.asOf ? `As of ${new Date(health.asOf).toISOString().slice(0, 10)} UTC` : ""}</span>
      </CardFooter>
    </Card>
  );
}
