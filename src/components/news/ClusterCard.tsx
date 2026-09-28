"use client";

import { useState } from "react";
import { ExternalLink, Layers, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { formatAge, formatDateTime } from "@/lib/format";
import { apiPost, ApiError } from "@/hooks/useApi";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { NewsCluster } from "@/lib/news/types";
import { CATEGORY_LABEL, CATEGORY_TONE } from "./categories";

interface SummaryResp {
  status: "ok" | "not_configured";
  summary: string | null;
  message?: string;
  model?: string;
  cached?: boolean;
  label?: string;
}

export function ClusterCard({ cluster, aiAvailable, compact = false }: { cluster: NewsCluster; aiAvailable: boolean | null; compact?: boolean }) {
  const { tz } = usePreferences();
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lead = cluster.lead;
  const others = cluster.items.filter((i) => i.url !== lead.url);

  const summarize = async () => {
    setLoading(true);
    setErr(null);
    try {
      setSummary(await apiPost<SummaryResp>("/api/news/summarize", { clusterId: cluster.id }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Summary failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="group rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={CATEGORY_TONE[cluster.primaryCategory]}>{CATEGORY_LABEL[cluster.primaryCategory]}</Badge>
        {cluster.categories
          .filter((c) => c !== cluster.primaryCategory)
          .slice(0, compact ? 1 : 3)
          .map((c) => (
            <span key={c} className="text-2xs text-fg-muted">
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        {cluster.relevance === "MARKET" && <Badge tone="neutral">Market context</Badge>}
        <span className="ml-auto inline-flex items-center gap-1 text-2xs text-fg-muted" title={formatDateTime(cluster.firstPublishedAt, tz)}>
          <time dateTime={new Date(cluster.firstPublishedAt).toISOString()}>{formatAge(cluster.firstPublishedAt)}</time>
        </span>
      </div>
      <h3 className="text-sm font-semibold leading-snug text-fg">
        <a href={lead.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-strong hover:underline">
          {cluster.title}
          <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-fg-muted" aria-hidden />
        </a>
      </h3>
      {!compact && lead.excerpt && !summary?.summary && <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">{lead.excerpt}</p>}
      {summary?.summary && (
        <div className="mt-2 rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs leading-relaxed text-fg-secondary">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-strong">
            <Sparkles className="h-3 w-3" /> AI summary {summary.cached ? "· cached" : ""}
          </div>
          {summary.summary}
          <p className="mt-1 text-2xs text-fg-muted">{summary.label}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-fg-muted">
        <span className="font-medium text-fg-secondary">{lead.source}</span>
        <span>{formatDateTime(lead.publishedAt, tz)}</span>
        {cluster.sourceCount > 1 ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-1 text-accent-strong hover:underline" aria-expanded={expanded}>
            <Layers className="h-3 w-3" /> {cluster.sourceCount} sources
          </button>
        ) : (
          <span>Single source</span>
        )}
        {cluster.entities.length > 0 && !compact && <span className="truncate">{cluster.entities.slice(0, 4).join(" · ")}</span>}
        {!compact && (
          <span className="ml-auto">
            {aiAvailable === false ? (
              <span title="Summary requires AI provider">Summary requires AI provider</span>
            ) : !summary ? (
              <Button variant="ghost" size="xs" onClick={summarize} loading={loading} disabled={aiAvailable === null}>
                <Sparkles className="h-3 w-3" /> Summarize
              </Button>
            ) : summary.status === "not_configured" ? (
              <span>Summary requires AI provider</span>
            ) : null}
          </span>
        )}
      </div>
      {err && <p className="mt-1 text-2xs text-danger">{err}</p>}
      {expanded && others.length > 0 && (
        <ul className={cn("mt-2 space-y-1 border-l border-border-subtle pl-3 animate-fade-up")}>
          {others.map((i) => (
            <li key={i.url} className="text-2xs text-fg-muted">
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-fg-secondary hover:text-accent-strong hover:underline">
                {i.source}: {i.title}
              </a>{" "}
              · {formatDateTime(i.publishedAt, tz)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
