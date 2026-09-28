"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useApi } from "@/hooks/useApi";
import { formatPct, formatPrice } from "@/lib/format";
import { BriefView } from "./BriefView";
import { AiNarrativeCard } from "./AiNarrativeCard";
import { AskBox } from "./AskBox";
import type { BriefApiResponse } from "./types";

export function AiIntelligence() {
  const [type, setType] = useState<"daily" | "weekly">("daily");
  const base = useApi<BriefApiResponse>(`/api/ai/brief?type=${type}`, { staleMs: 5 * 60_000, refreshMs: 10 * 60_000 });
  const aiConfigured = base.data ? base.data.aiConfigured : null;
  const narr = useApi<BriefApiResponse>(aiConfigured ? `/api/ai/brief?type=${type}&narrative=1` : null, { staleMs: 30 * 60_000 });
  const s = base.data?.snapshot;
  const b = base.data?.brief;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="AI Intelligence"
        badge={<Badge tone="accent">Data-grounded</Badge>}
        description="Daily and weekly XRP briefs built from structured internal data — live market data, regime & risk engines, correlations, XRPL sample and clustered news. AI only explains; it never supplies numbers."
        actions={
          <>
            <Tabs
              value={type}
              onChange={setType}
              ariaLabel="Brief type"
              items={[
                { value: "daily", label: "Daily brief" },
                { value: "weekly", label: "Weekly brief" },
              ]}
            />
            <ButtonLink href={`/research/report?type=${type}`} variant="secondary" size="sm">
              <FileText className="h-4 w-4" /> Report
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={base.reload} aria-label="Refresh brief">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="XRP / USD" loading={!s} value={formatPrice(s?.market.price ?? null)} delta={s?.market.changePct24h != null ? formatPct(s.market.changePct24h) : undefined} deltaTone={toneOf(s?.market.changePct24h)} sub={s?.market.provenance?.source} />
        <MetricCard label={type === "weekly" ? "7D return" : "30D return"} loading={!s} value={formatPct(type === "weekly" ? (s?.returns.d7 ?? null) : (s?.returns.d30 ?? null))} sub="vs daily close (UTC)" />
        <MetricCard label="Regime · Risk" loading={!s} value={<span className="text-base">{s?.regime.current ?? "n/a"}</span>} sub={`Risk ${s?.risk.level ?? "n/a"}${s?.risk.score != null ? ` · ${s.risk.score.toFixed(0)}/100` : ""}`} />
        <MetricCard label="30D volatility" loading={!s} value={s?.volatility.vol30Pct != null ? `${s.volatility.vol30Pct.toFixed(0)}%` : "—"} sub={s?.volatility.percentile != null ? `${s.volatility.percentile.toFixed(0)}th pct · BTC ρ ${s.correlation.btc30?.toFixed(2) ?? "—"}` : undefined} info="Annualized realized volatility of daily log returns; percentile vs the full provider history." />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-8" aria-label="Data brief">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">{b?.title ?? "Data brief"}</h2>
              <p className="truncate text-xs text-fg-muted">{b?.headline ?? "Building snapshot…"}</p>
            </div>
            <DataFreshness timestamp={s?.asOf ?? null} kind="minute" />
          </div>
          {base.loading && !b ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          ) : base.error && !b ? (
            <Card>
              <ErrorState message={base.error.message} onRetry={base.reload} />
            </Card>
          ) : b ? (
            <>
              <BriefView brief={b} />
              <Card>
                <CardHeader title="Methodology" />
                <CardBody className="space-y-2 text-xs leading-relaxed text-fg-secondary">
                  <p>{b.methodology}</p>
                  <p>Providers used: {s?.providers.join(" · ") || "—"}.</p>
                </CardBody>
              </Card>
            </>
          ) : null}
        </section>
        <aside className="space-y-4 lg:col-span-4">
          <AiNarrativeCard
            aiConfigured={aiConfigured}
            status={narr.data?.ai.status ?? null}
            narrative={narr.data?.ai.narrative ?? null}
            message={narr.data?.ai.message}
            loading={narr.loading || aiConfigured === null}
            error={narr.error?.message ?? null}
            onRetry={narr.reload}
          />
          <AskBox aiConfigured={aiConfigured} />
          <Card>
            <CardHeader title="How to read this" icon={<Sparkles className="h-4 w-4" />} />
            <CardBody className="space-y-1.5 text-xs text-fg-secondary">
              <p>
                <strong className="text-success">FACT</strong> — measured or reported, with a source. <strong className="text-info">ANALYSIS</strong> — rule-based or AI interpretation.{" "}
                <strong className="text-accent-strong">SCENARIO</strong> — conditional range, never a prediction. <strong className="text-fg-muted">N/A</strong> — input unavailable; nothing is filled in.
              </p>
              <p>
                Verify statements in <Link href="/news/claim-check" className="text-accent-strong hover:underline">Claim Check</Link>; model-based ranges live in <Link href="/future" className="text-accent-strong hover:underline">Future</Link>.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
