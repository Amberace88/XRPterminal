"use client";

import { ExternalLink, History } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, NotConnected, SkeletonRows } from "@/components/ui/States";
import { Hash } from "@/components/ui/Misc";
import { useApi } from "@/hooks/useApi";
import type { ForecastHistoryResponse, PublishedForecastItem } from "@/lib/forecast/api-types";
import { numOrDash, px, utcDate } from "./shared";

const cols: Column<PublishedForecastItem>[] = [
  { key: "as_of", header: "As of", cell: (r) => <span className="num">{utcDate(r.as_of)}</span>, value: (r) => r.as_of },
  { key: "h", header: "H", align: "right", cell: (r) => <span className="num">{r.horizon_days}d</span>, value: (r) => r.horizon_days },
  { key: "base", header: "BASE (P25–P75)", cell: (r) => <span className="num">{px(r.quantiles.p25)} – {px(r.quantiles.p75)}</span>, value: (r) => r.quantiles.p50 },
  { key: "p90", header: "P5–P95", hideBelow: "md", cell: (r) => <span className="num text-fg-secondary">{px(r.quantiles.p05)} – {px(r.quantiles.p95)}</span>, value: (r) => r.quantiles.p95 },
  { key: "target", header: "Target", hideBelow: "sm", cell: (r) => <span className="num">{utcDate(r.target_date)}</span>, value: (r) => r.target_date },
  {
    key: "actual",
    header: "Actual / result",
    cell: (r) =>
      r.evaluation ? (
        <span className="flex flex-wrap items-center gap-1">
          <span className="num">{px(r.evaluation.actual_price)}</span>
          <Badge tone={r.evaluation.in_p25_p75 ? "success" : r.evaluation.in_p5_p95 ? "info" : "danger"}>
            {r.evaluation.in_p25_p75 ? "in BASE" : r.evaluation.in_p5_p95 ? "in 90%" : "outside 90%"}
          </Badge>
          <span className="num text-2xs text-fg-muted">err {numOrDash(r.evaluation.abs_pct_error, 1, "%")}</span>
        </span>
      ) : (
        <span className="text-fg-muted">pending</span>
      ),
    value: (r) => r.evaluation?.abs_pct_error ?? null,
  },
  { key: "v", header: "Model", hideBelow: "lg", cell: (r) => <span className="num text-2xs">{r.model_name} v{r.model_version}</span>, value: (r) => r.model_version },
  { key: "hash", header: "Record", hideBelow: "lg", cell: (r) => <Hash value={r.payload_hash} head={6} tail={4} />, sortable: false },
];

export function ForecastHistoryCard({ horizonDays, className }: { horizonDays: number; className?: string }) {
  const { data, error, loading, reload, updatedAt } = useApi<ForecastHistoryResponse>(`/api/forecast/history?h=${horizonDays}&limit=60`, { staleMs: 5 * 60_000 });
  return (
    <Card className={className}>
      <CardHeader
        title="Published forecast history"
        icon={<History className="h-4 w-4" />}
        subtitle="Immutable records — never overwritten; evaluated automatically when they mature"
        info="Each daily forecast is stored append-only with its inputs, scenarios, uncertainty, model version and a payload hash. Evaluations compare the stored ranges with the realized close."
      />
      <CardBody>
        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={reload} lastUpdated={updatedAt} />
        ) : data && !data.configured ? (
          <NotConnected
            what="Published forecast history requires the database."
            how="Until Supabase is configured, forecasts on this page are computed live and marked “Computed now — not yet published”. The walk-forward benchmark above does not need the database."
          />
        ) : data && data.configured ? (
          <>
            {data.summary.evaluated > 0 && (
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-secondary">
                <span>
                  Evaluated <span className="num text-fg">{data.summary.evaluated}</span> / {data.summary.n}
                  {data.summary.evaluated < 30 && <Badge tone="warning" className="ml-1">small N</Badge>}
                </span>
                <span>
                  In BASE <span className="num text-fg">{numOrDash(data.summary.coverage50, 0, "%")}</span> (nominal 50%)
                </span>
                <span>
                  In 90% band <span className="num text-fg">{numOrDash(data.summary.coverage90, 0, "%")}</span> (nominal 90%)
                </span>
                <span>
                  MAPE <span className="num text-fg">{numOrDash(data.summary.mape, 1, "%")}</span>
                </span>
              </div>
            )}
            <DataTable
              rows={data.forecasts}
              columns={cols}
              rowKey={(r) => r.id}
              csvName={`published-forecasts-${horizonDays}d`}
              pageSize={10}
              empty={{ title: "No published forecasts yet", description: "The daily job publishes one immutable record per horizon after each UTC daily close." }}
            />
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** EXTERNAL VIEW (spec §67) — always separate from our model; empty until verified sources are added. */
export function ExternalViewCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="External view" icon={<ExternalLink className="h-4 w-4" />} actions={<TrustBadge kind="EXTERNAL" />} subtitle="Third-party forecasts — never merged with XRP Terminal's model" />
      <CardBody>
        <EmptyState
          title="No external forecasts listed"
          description="When added, each external view will show its source, author/entity, date, forecast and methodology (if disclosed), clearly separated from our own scenario model. We never invent or paraphrase external forecasts."
        />
      </CardBody>
    </Card>
  );
}
