"use client";

import Link from "next/link";
import { Layers, Newspaper } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { formatAge } from "@/lib/format";
import { CATEGORY_LABEL, CATEGORY_TONE } from "@/components/news/categories";
import type { NewsApiResponse } from "@/components/news/types";

/** Dashboard widget: top 6 XRP story clusters with source counts. */
export function NewsWidget({ className }: { className?: string }) {
  const { data, error, loading, reload } = useApi<NewsApiResponse>("/api/news?relevance=xrp&limit=6", { refreshMs: 10 * 60_000, staleMs: 5 * 60_000 });
  const healthy = data?.sources.filter((s) => s.status !== "DOWN").length ?? 0;
  return (
    <Card className={className}>
      <CardHeader
        title="News"
        icon={<Newspaper className="h-4 w-4" />}
        subtitle={data ? `${healthy}/${data.sources.length} sources reachable` : "XRP headlines"}
        actions={
          <Link href="/news" className="text-xs text-accent-strong hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="max-h-[300px] overflow-y-auto">
        {loading && !data ? (
          <SkeletonRows rows={5} />
        ) : error && !data ? (
          <ErrorState compact message={error.message} onRetry={reload} provider="Public RSS feeds" />
        ) : !data?.clusters.length ? (
          <EmptyState title="No XRP stories right now" description="Sources are reachable but returned no XRP-related headlines." className="py-6" />
        ) : (
          <ul className="space-y-2.5">
            {data.clusters.slice(0, 6).map((c) => (
              <li key={c.id} className="min-w-0">
                <a href={c.lead.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-xs font-medium leading-snug text-fg hover:text-accent-strong hover:underline">
                  {c.title}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-muted">
                  <Badge tone={CATEGORY_TONE[c.primaryCategory]} className="scale-90">
                    {CATEGORY_LABEL[c.primaryCategory]}
                  </Badge>
                  <span>{c.lead.source}</span>
                  {c.sourceCount > 1 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Layers className="h-3 w-3" /> {c.sourceCount}
                    </span>
                  )}
                  <span>{formatAge(c.firstPublishedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
