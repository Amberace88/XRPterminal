"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Telescope } from "lucide-react";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { TrustBadge, Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { HORIZONS } from "@/lib/forecast/horizons";
import type { CurrentForecastResponse } from "@/lib/forecast/api-types";
import type { HorizonKey, HorizonStatus } from "@/lib/forecast/types";
import { ForecastFanCard, ForecastSummaryCard } from "./ForecastOverview";
import { ScenarioCards } from "./ScenarioCards";
import { WhatChangedCard } from "./WhatChangedCard";
import { InputsCard } from "./InputsCard";
import { BenchmarkSection } from "./BenchmarkSection";
import { ExternalViewCard, ForecastHistoryCard } from "./HistoryAndExternal";
import { MethodologyModal } from "./MethodologyModal";

function HorizonNotes({ statuses }: { statuses: HorizonStatus[] }) {
  const flagged = statuses.filter((s) => s.status !== "enabled");
  if (!flagged.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-2xs leading-relaxed text-fg-muted">
      {flagged.map((s) => (
        <li key={s.key}>
          <span className={s.status === "disabled" ? "text-fg-secondary" : "text-warning"}>
            {s.key} {s.status === "disabled" ? "disabled" : "low sample"}:
          </span>{" "}
          {s.reason}
        </li>
      ))}
    </ul>
  );
}

function LoadingLayout() {
  return (
    <div role="status" aria-label="Loading scenario model">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="card p-5 lg:col-span-8">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="card space-y-3 p-5 lg:col-span-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FutureView({ initialHorizon = "30D" }: { initialHorizon?: HorizonKey }) {
  const [hKey, setHKey] = useState<HorizonKey>(initialHorizon);
  const [statuses, setStatuses] = useState<HorizonStatus[] | null>(null);
  const [method, setMethod] = useState(false);
  const days = HORIZONS.find((h) => h.key === hKey)?.days ?? 30;
  const { data, error, loading, reload, updatedAt } = useApi<CurrentForecastResponse>(`/api/forecast/current?h=${days}`, { staleMs: 10 * 60_000 });

  useEffect(() => {
    if (data?.horizons) setStatuses(data.horizons);
  }, [data?.horizons]);

  const select = useCallback((k: HorizonKey) => {
    setHKey(k);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("h", k);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-browser */
    }
  }, []);

  const statusOf = (k: HorizonKey) => statuses?.find((s) => s.key === k);
  const current = statusOf(hKey);
  const isDisabled = current?.status === "disabled" || error?.code === "HORIZON_DISABLED";
  const f = data && data.forecast.horizonDays === days ? data.forecast : undefined;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Telescope className="h-5 w-5 text-accent" /> Future Intelligence
          </span>
        }
        badge={<TrustBadge kind="MODEL" />}
        description={
          <>
            <strong className="font-semibold text-fg">Scenario ranges, not predictions.</strong> A deterministic, versioned model turns XRP&apos;s own return history into
            BEAR / BASE / BULL / EXTREME ranges with explicit uncertainty — and is benchmarked against simple baselines, including where it performs poorly.
          </>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => setMethod(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Methodology
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="label">Horizon</span>
              <Tabs<HorizonKey>
                ariaLabel="Forecast horizon"
                value={hKey}
                onChange={select}
                items={HORIZONS.map((h) => {
                  const st = statusOf(h.key);
                  return {
                    value: h.key,
                    disabled: st?.status === "disabled",
                    title: st?.reason,
                    label: (
                      <span className="inline-flex items-center gap-1">
                        {h.key}
                        {st?.status === "low_sample" && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-label="low sample" />}
                      </span>
                    ),
                  };
                })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-muted">
              <Badge tone="neutral">XRP-USD</Badge>
              {f && (
                <span className="num">
                  {f.modelName} v{f.modelVersion} · as of {f.asOfDate} UTC close
                </span>
              )}
            </div>
          </div>
          {statuses && <HorizonNotes statuses={statuses} />}
        </CardBody>
      </Card>

      {isDisabled ? (
        <Card>
          <EmptyState
            title={`${hKey} horizon is disabled`}
            description={current?.reason ?? error?.message ?? "Not enough independent history for this horizon."}
            action={
              <Button size="sm" variant="secondary" onClick={() => select("30D")}>
                Show 30D
              </Button>
            }
          />
        </Card>
      ) : error && !f ? (
        <Card>
          <ErrorState message={error.message} onRetry={reload} lastUpdated={updatedAt} provider="Market history" />
        </Card>
      ) : loading && !f ? (
        <LoadingLayout />
      ) : f && data ? (
        <>
          {f.uncertainty.lowSample && (
            <div role="note" className="mb-4 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
              <strong className="font-semibold">Low sample.</strong> {current?.reason ?? "Few independent historical windows exist for this horizon."}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-12">
            <ForecastFanCard data={data} />
            <ForecastSummaryCard data={data} onMethodology={() => setMethod(true)} />
          </div>
          <ScenarioCards f={f} />
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <WhatChangedCard changes={data.whatChanged} className="lg:col-span-7" />
            <InputsCard f={f} className="lg:col-span-5" />
          </div>
        </>
      ) : null}

      <BenchmarkSection horizonDays={days} enabled={!isDisabled} />

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <ForecastHistoryCard horizonDays={days} className="lg:col-span-8" />
        <ExternalViewCard className="lg:col-span-4" />
      </div>

      <MethodologyModal open={method} onClose={() => setMethod(false)} f={f} />
      <Disclaimer className="mt-6" />
    </div>
  );
}
