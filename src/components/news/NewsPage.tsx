"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Newspaper, RefreshCw, ScanSearch } from "lucide-react";
import { PageHeader, Disclaimer, Switch } from "@/components/ui/Misc";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils/cn";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/types";
import { ClusterCard } from "./ClusterCard";
import { SourceHealthStrip } from "./SourceHealthStrip";
import { EventIntelligence } from "./EventIntelligence";
import { CATEGORY_LABEL } from "./categories";
import { HeadlineSentimentCard } from "@/components/social/HeadlineSentiment";
import type { AiStatusResponse, NewsApiResponse } from "./types";

const PAGE = 20;

export function NewsPage() {
  const { data, error, loading, reload, updatedAt } = useApi<NewsApiResponse>("/api/news?limit=200", { refreshMs: 10 * 60_000, staleMs: 5 * 60_000 });
  const status = useApi<AiStatusResponse>("/api/ai/status", { staleMs: 10 * 60_000 });
  const [cat, setCat] = useState<NewsCategory | "ALL">("ALL");
  const [xrpOnly, setXrpOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.clusters ?? []) {
      if (xrpOnly && c.relevance !== "XRP") continue;
      for (const k of c.categories) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [data, xrpOnly]);

  const clusters = useMemo(
    () => (data?.clusters ?? []).filter((c) => (!xrpOnly || c.relevance === "XRP") && (cat === "ALL" || c.categories.includes(cat))),
    [data, cat, xrpOnly],
  );
  const aiAvailable = status.data ? status.data.ai : status.error ? false : null;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="News"
        description="XRP, XRPL, Ripple & RLUSD headlines from public publisher feeds — deduplicated into stories, categorized deterministically, with every source linked."
        actions={
          <>
            <ButtonLink href="/news/claim-check" variant="secondary" size="sm">
              <ScanSearch className="h-4 w-4" /> Claim Check
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh news" loading={loading && !!data}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardBody className="space-y-3 pt-4">
          {data ? <SourceHealthStrip sources={data.sources} /> : <Skeleton className="h-6 w-full" />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="News categories">
              {(["ALL", ...NEWS_CATEGORIES] as const).map((c) => {
                const n = c === "ALL" ? (data?.clusters ?? []).filter((x) => !xrpOnly || x.relevance === "XRP").length : (counts.get(c) ?? 0);
                const active = cat === c;
                return (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setCat(c);
                      setShown(PAGE);
                    }}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      active ? "bg-accent/15 text-fg ring-1 ring-accent/40" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                      c !== "ALL" && n === 0 && !active && "opacity-50",
                    )}
                  >
                    {c === "ALL" ? "All" : CATEGORY_LABEL[c]} <span className="num text-fg-muted">{n}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-fg-secondary">
              <Switch checked={xrpOnly} onChange={setXrpOnly} label="XRP-related only" />
              XRP-related only
            </label>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-8" aria-label="News stories">
          <div className="flex items-center justify-between text-2xs text-fg-muted">
            <span>
              {clusters.length} stor{clusters.length === 1 ? "y" : "ies"}
              {data ? ` from ${data.itemCount} headlines` : ""}
            </span>
            <DataFreshness timestamp={data?.fetchedAt ?? updatedAt} kind="hourly" />
          </div>
          {loading && !data ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
          ) : error && !data ? (
            <Card>
              <ErrorState message={error.message} onRetry={reload} provider="Public RSS feeds" />
            </Card>
          ) : clusters.length === 0 ? (
            <Card>
              <EmptyState icon={<Newspaper className="h-5 w-5" />} title="No stories in this category" description="Try another category or include general market context." />
            </Card>
          ) : (
            <>
              {clusters.slice(0, shown).map((c) => (
                <ClusterCard key={c.id} cluster={c} aiAvailable={aiAvailable} />
              ))}
              {shown < clusters.length && (
                <div className="flex justify-center pt-1">
                  <Button variant="secondary" size="sm" onClick={() => setShown((s) => s + PAGE)}>
                    Show more ({clusters.length - shown})
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="pt-2 text-center text-2xs text-fg-muted">Headlines link to original publishers. XRP Terminal stores headline metadata only and does not reproduce articles.</p>
        </section>

        <aside className="space-y-4 lg:col-span-4">
          {data ? (
            <EventIntelligence events={data.events} />
          ) : (
            <Card>
              <CardBody>
                <Skeleton className="h-40 w-full" />
              </CardBody>
            </Card>
          )}
          <HeadlineSentimentCard />
          <Card>
            <CardHeader title="Methodology" />
            <CardBody className="space-y-2 text-xs leading-relaxed text-fg-secondary">
              <p>{data?.methodology ?? "Loading…"}</p>
              <p>
                Verify a specific statement with <Link href="/news/claim-check" className="text-accent-strong hover:underline">Claim Check</Link>. Set keyword or category alerts in{" "}
                <Link href="/alerts" className="text-accent-strong hover:underline">Alerts</Link>.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
