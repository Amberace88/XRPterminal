"use client";

import Link from "next/link";
import { Telescope } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { formatPct, formatPrice } from "@/lib/format";
import type { CurrentForecastResponse } from "@/lib/forecast/api-types";
import { cn } from "@/lib/utils/cn";

const TONE = { BEAR: "danger", BASE: "accent", BULL: "success", EXTREME: "warning" } as const;

/** Dashboard widget: 30-day scenario ranges (compact). Scenario ranges, not predictions. */
export function FutureScenariosWidget({ className }: { className?: string }) {
  const { data, error, loading, reload, updatedAt } = useApi<CurrentForecastResponse>("/api/forecast/current?h=30", { staleMs: 10 * 60_000 });
  const f = data?.forecast;
  return (
    <Card className={cn("flex min-h-[280px] flex-col", className)}>
      <CardHeader
        title="30D scenario ranges"
        icon={<Telescope className="h-4 w-4" />}
        subtitle={f ? `${f.modelName} v${f.modelVersion} · as of ${f.asOfDate}` : "Scenario ranges, not predictions"}
        actions={
          <Link href="/future?h=30D" className="text-xs font-medium text-accent-strong hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="flex-1">
        {loading && !f ? (
          <div className="space-y-2.5" role="status" aria-label="Loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error && !f ? (
          <ErrorState compact message={error.message} onRetry={reload} lastUpdated={updatedAt} />
        ) : f ? (
          <ul className="divide-y divide-border-subtle">
            {f.scenarios.map((s) => {
              const r = s.kind === "EXTREME" && s.tails ? null : s.range;
              return (
                <li key={s.kind} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2">
                    <Badge tone={TONE[s.kind]}>{s.kind}</Badge>
                    <span className="num text-2xs text-fg-muted">{s.band}</span>
                  </span>
                  {r ? (
                    <span className="text-right">
                      <span className="num block text-sm font-medium text-fg">
                        {formatPrice(r.low, "USD")} – {formatPrice(r.high, "USD")}
                      </span>
                      <span className="num block text-2xs text-fg-muted">
                        {formatPct(r.lowPct, 1)} to {formatPct(r.highPct, 1)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-right">
                      <span className="num block text-sm font-medium text-fg">
                        &lt;{formatPrice(s.tails!.lower.high, "USD")} · &gt;{formatPrice(s.tails!.upper.low, "USD")}
                      </span>
                      <span className="num block text-2xs text-fg-muted">
                        P1 {formatPrice(s.tails!.lower.low, "USD")} · P99 {formatPrice(s.tails!.upper.high, "USD")}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardBody>
      <CardFooter>
        <span className="truncate">
          {f ? `Anchor ${formatPrice(f.inputs.anchorPrice, "USD")} · N=${f.uncertainty.returnSampleSize} · ${data?.provenance.source ?? ""}` : "Model output · not investment advice"}
        </span>
        <span className="hidden shrink-0 sm:inline">Ranges, not targets</span>
      </CardFooter>
    </Card>
  );
}
