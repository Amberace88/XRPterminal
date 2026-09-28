"use client";

import { useMemo, useState } from "react";
import { Scale, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { SourceLine } from "@/components/ui/DataFreshness";
import { InfoTip } from "@/components/ui/Tooltip";
import { FanChart, LineChart } from "@/components/charts/Charts";
import { useApi } from "@/hooks/useApi";
import { formatPrice } from "@/lib/format";
import type { EvaluationResponse } from "@/lib/forecast/api-types";
import type { Metrics, ModelEvaluation } from "@/lib/forecast/evaluate";
import { cn } from "@/lib/utils/cn";
import { numOrDash, SmallN, utcDate } from "./shared";

type View = "table" | "calibration" | "actual" | "regime" | "year";

const covTone = (v: number | null, nominal: number) => {
  if (v === null) return "text-fg-muted";
  const d = Math.abs(v - nominal);
  return d <= 7 ? "text-success" : d <= 15 ? "text-warning" : "text-danger";
};

function metricCols(best: { pinball: number | null }): Column<{ key: string; label: string; kind?: string; m: Metrics }>[] {
  return [
    {
      key: "label",
      header: "Model / group",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className={cn("font-medium", r.kind === "model" ? "text-accent-strong" : "text-fg")}>{r.label}</span>
          {r.kind === "model" && <Badge tone="accent">Model</Badge>}
          {r.kind === "baseline" && <Badge tone="neutral">Baseline</Badge>}
        </span>
      ),
      value: (r) => r.label,
    },
    { key: "n", header: "N", align: "right", cell: (r) => <SmallN n={r.m.n} nEff={r.m.nEffective} />, value: (r) => r.m.n },
    { key: "mape", header: "MAPE", align: "right", cell: (r) => <span className="num">{numOrDash(r.m.mape, 1, "%")}</span>, value: (r) => r.m.mape },
    { key: "mae", header: "MAE", align: "right", hideBelow: "md", cell: (r) => <span className="num">{formatPrice(r.m.mae, "USD")}</span>, value: (r) => r.m.mae },
    { key: "rmse", header: "RMSE", align: "right", hideBelow: "lg", cell: (r) => <span className="num">{formatPrice(r.m.rmse, "USD")}</span>, value: (r) => r.m.rmse },
    {
      key: "dir",
      header: "Direction",
      align: "right",
      hideBelow: "sm",
      cell: (r) => (r.m.directionalAccuracy === null ? <span className="text-fg-muted">no call</span> : <span className="num">{r.m.directionalAccuracy.toFixed(0)}% <span className="text-fg-muted">({r.m.nDirectional})</span></span>),
      value: (r) => r.m.directionalAccuracy,
    },
    { key: "c50", header: "P25–P75 (50%)", align: "right", cell: (r) => <span className={cn("num", covTone(r.m.coverage50, 50))}>{numOrDash(r.m.coverage50, 0, "%")}</span>, value: (r) => r.m.coverage50 },
    { key: "c90", header: "P5–P95 (90%)", align: "right", cell: (r) => <span className={cn("num", covTone(r.m.coverage90, 90))}>{numOrDash(r.m.coverage90, 0, "%")}</span>, value: (r) => r.m.coverage90 },
    {
      key: "pin",
      header: "Pinball",
      align: "right",
      hideBelow: "sm",
      cell: (r) => (
        <span className={cn("num", best.pinball !== null && r.m.pinballPct === best.pinball && "font-semibold text-success")}>{numOrDash(r.m.pinballPct, 2, "%")}</span>
      ),
      value: (r) => r.m.pinballPct,
    },
  ];
}

export function BenchmarkSection({ horizonDays, enabled }: { horizonDays: number; enabled: boolean }) {
  const { data, error, loading, reload, updatedAt } = useApi<EvaluationResponse>(enabled ? `/api/forecast/evaluation?h=${horizonDays}` : null, { staleMs: 60 * 60_000 });
  const [view, setView] = useState<View>("table");
  const [groupModel, setGroupModel] = useState<string>("xrpt-scenario");
  const r = data?.report;

  const overallRows = useMemo(() => (r ? r.models.map((m) => ({ key: m.model, label: m.label, kind: m.kind, m: m.overall })) : []), [r]);
  const bestPin = useMemo(() => {
    const v = overallRows.map((x) => x.m.pinballPct).filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  }, [overallRows]);
  const calib = useMemo(() => {
    if (!r) return [];
    const levels = r.models[0]?.overall.calibration ?? [];
    return levels.map((lv, i) => {
      const row: Record<string, number | string | null> = { x: `P${Math.round(lv.nominal * 100)}`, ideal: lv.nominal * 100 };
      for (const m of r.models) row[m.model] = m.overall.calibration[i]?.empirical !== null && m.overall.calibration[i] ? (m.overall.calibration[i].empirical as number) * 100 : null;
      return row;
    });
  }, [r]);
  const actualRows = useMemo(() => (r ? r.series.map((s) => ({ t: s.target, price: s.actual, p05: s.p05, p25: s.p25, p50: s.p50, p75: s.p75, p95: s.p95 })) : []), [r]);
  const groupSource: ModelEvaluation | undefined = r?.models.find((m) => m.model === groupModel) ?? r?.models[0];
  const groupRows = useMemo(() => {
    if (!groupSource) return [];
    const src = view === "regime" ? groupSource.byRegime : groupSource.byYear;
    return src.map((g) => ({ key: g.key, label: g.key, m: g.metrics }));
  }, [groupSource, view]);

  const main = r?.models.find((m) => m.kind === "model");
  const persistence = r?.models.find((m) => m.model === "persistence");
  const verdict =
    main && persistence && main.overall.pinballPct !== null && persistence.overall.pinballPct !== null
      ? main.overall.pinballPct < persistence.overall.pinballPct
        ? `Over this sample the scenario model's quantile (pinball) loss is ${(((persistence.overall.pinballPct - main.overall.pinballPct) / persistence.overall.pinballPct) * 100).toFixed(1)}% lower than naive persistence.`
        : `Over this sample the scenario model does NOT beat naive persistence on quantile (pinball) loss (${main.overall.pinballPct.toFixed(2)}% vs ${persistence.overall.pinballPct.toFixed(2)}%).`
      : null;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Forecast vs actual · model benchmark"
        icon={<Scale className="h-4 w-4" />}
        subtitle={r ? `Walk-forward ${r.firstAsOf} → ${r.lastAsOf} · ${r.nAsOf} as-of dates every ${r.stepDays} days · ${horizonDays}-day horizon` : `Walk-forward test · ${horizonDays}-day horizon`}
        info="Each historical as-of date is forecast using only data available on that date, then compared with the realized close H days later. Coverage should be close to nominal (50% / 90%). Pinball = average quantile loss in % of price (lower is better)."
      />
      <CardBody>
        {!enabled ? (
          <p className="text-sm text-fg-muted">Evaluation is not available for disabled horizons.</p>
        ) : loading && !r ? (
          <SkeletonRows rows={6} />
        ) : error && !r ? (
          <ErrorState message={error.message} onRetry={reload} lastUpdated={updatedAt} />
        ) : r ? (
          <>
            {verdict && <p className="mb-3 rounded-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-xs text-fg-secondary">{verdict} Past accuracy does not guarantee future accuracy.</p>}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Tabs<View>
                ariaLabel="Benchmark view"
                size="xs"
                value={view}
                onChange={setView}
                items={[
                  { value: "table", label: "Model vs baselines" },
                  { value: "calibration", label: "Calibration" },
                  { value: "actual", label: "Forecast vs actual" },
                  { value: "regime", label: "By regime" },
                  { value: "year", label: "By year" },
                ]}
              />
              {(view === "regime" || view === "year") && (
                <label className="flex items-center gap-2 text-2xs text-fg-muted">
                  Model
                  <select className="select h-7 py-0 text-xs" value={groupSource?.model} onChange={(e) => setGroupModel(e.target.value)}>
                    {r.models.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {view === "table" && <DataTable rows={overallRows} columns={metricCols({ pinball: bestPin })} rowKey={(x) => x.key} csvName={`walkforward-${horizonDays}d`} pageSize={10} />}

            {view === "calibration" && (
              <div>
                <LineChart
                  data={calib}
                  x="x"
                  height={260}
                  yFormat={(v) => `${v.toFixed(0)}%`}
                  series={[
                    ...r.models.map((m) => ({ key: m.model, label: m.label })),
                    { key: "ideal", label: "Perfect calibration", dashed: true },
                  ]}
                />
                <p className="mt-2 text-2xs leading-relaxed text-fg-muted">
                  For each quantile level, the share of realized outcomes that fell below the forecast quantile. A calibrated model tracks the dashed diagonal (e.g. 25% of
                  outcomes below P25). Above the line ⇒ quantiles too high; below ⇒ too low. N = {main?.overall.n ?? 0}
                  {main && main.overall.nEffective !== main.overall.n ? ` (≈${main.overall.nEffective} independent)` : ""}.
                </p>
              </div>
            )}

            {view === "actual" && (
              <div>
                <FanChart data={actualRows} height={280} xFormat={(v) => utcDate(Number(v))} yFormat={(v) => formatPrice(v, "USD")} />
                <p className="mt-2 text-2xs text-fg-muted">
                  Solid line: realized close at each target date. Bands: the model&apos;s P5–P95 / P25–P75 range issued {horizonDays} days earlier (walk-forward, {r.evalPaths} paths).
                </p>
              </div>
            )}

            {(view === "regime" || view === "year") && (
              <DataTable
                rows={groupRows}
                columns={metricCols({ pinball: null })}
                rowKey={(x) => x.key}
                csvName={`walkforward-${horizonDays}d-${view}`}
                pageSize={12}
                empty={{ title: "No evaluated periods" }}
              />
            )}

            <div className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.05] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
                <TriangleAlert className="h-3.5 w-3.5" /> Poor periods (scenario model)
                <InfoTip text="Years or regimes where 90% coverage fell below 75%, 50% coverage below 30%, or MAPE exceeded 1.5× the overall level. Shown deliberately — never hidden." />
              </div>
              {r.poorPeriods.length ? (
                <ul className="space-y-0.5 text-xs text-fg-secondary">
                  {r.poorPeriods.map((p) => (
                    <li key={p.key}>
                      <span className="font-medium text-fg">{p.key}</span> — {p.reason} <span className="text-fg-muted">(N={p.n})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-muted">No period met the poor-performance thresholds in this sample.</p>
              )}
            </div>
            <ul className="mt-3 list-disc space-y-0.5 pl-4 text-2xs text-fg-muted">
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        ) : null}
      </CardBody>
      {data && (
        <CardFooter>
          <SourceLine provenance={data.provenance} />
          <span className="num hidden sm:inline">computed in {(data.report.computeMs / 1000).toFixed(1)}s</span>
        </CardFooter>
      )}
    </Card>
  );
}
