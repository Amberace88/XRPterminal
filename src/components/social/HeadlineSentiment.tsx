"use client";

import { useState } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { SentimentResult } from "@/lib/social/sentiment";

interface Resp extends SentimentResult {
  hours: number;
  title: string;
  disclaimer: string;
  fetchedAt: number;
}

const TONE = { BULLISH: "success", BEARISH: "danger", MIXED: "warning", NEUTRAL: "neutral" } as const;

/** Headline sentiment (news-derived) — spec §81: sample size, source count, period, methodology. */
export function HeadlineSentimentCard({ className, defaultHours = 72 }: { className?: string; defaultHours?: 24 | 72 | 168 }) {
  const [hours, setHours] = useState<"24" | "72" | "168">(String(defaultHours) as "24" | "72" | "168");
  const { tz } = usePreferences();
  const { data, error, loading, reload } = useApi<Resp>(`/api/social/sentiment?hours=${hours}`, { staleMs: 5 * 60_000 });
  const n = data?.sampleSize ?? 0;
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  return (
    <Card className={className}>
      <CardHeader
        title="Headline sentiment (news-derived)"
        subtitle="Tone of XRP headlines — not a price signal"
        info={data?.methodology ?? "Lexicon scoring of real XRP headlines; one vote per story cluster."}
        actions={
          <Tabs
            size="xs"
            value={hours}
            onChange={setHours}
            ariaLabel="Sentiment window"
            items={[
              { value: "24", label: "24h" },
              { value: "72", label: "3d" },
              { value: "168", label: "7d" },
            ]}
          />
        }
      />
      <CardBody>
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : error && !data ? (
          <ErrorState compact message={error.message} onRetry={reload} />
        ) : data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {data.sufficient ? (
                <Badge tone={TONE[data.label as keyof typeof TONE] ?? "neutral"} className="text-xs">
                  {data.label}
                </Badge>
              ) : (
                <Badge tone="neutral" className="text-xs">
                  Insufficient sample
                </Badge>
              )}
              <span className="text-xs text-fg-muted">
                {n} stories · {data.sourceCount} publishers
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={`Bullish ${pct(data.bullish)}%, neutral ${pct(data.neutral)}%, bearish ${pct(data.bearish)}%`}>
              <div className="bg-success/80" style={{ width: `${pct(data.bullish)}%` }} />
              <div className="bg-fg-muted/40" style={{ width: `${pct(data.neutral)}%` }} />
              <div className="bg-danger/80" style={{ width: `${pct(data.bearish)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-2xs">
              <div>
                <div className="num text-sm font-semibold text-success">{data.bullish}</div>
                <div className="text-fg-muted">positive tone</div>
              </div>
              <div>
                <div className="num text-sm font-semibold text-fg-secondary">{data.neutral}</div>
                <div className="text-fg-muted">neutral</div>
              </div>
              <div>
                <div className="num text-sm font-semibold text-danger">{data.bearish}</div>
                <div className="text-fg-muted">negative tone</div>
              </div>
            </div>
            {!data.sufficient && <p className="text-2xs text-fg-muted">Fewer than {data.minSample} scored stories in this window — no aggregate label is shown.</p>}
          </div>
        ) : null}
      </CardBody>
      <CardFooter>
        <span className="truncate">
          {data?.periodStart ? `${formatDateTime(data.periodStart, tz)} – ${formatDateTime(data.periodEnd, tz)}` : "Period: —"} · Sentiment ≠ future price
        </span>
      </CardFooter>
    </Card>
  );
}
