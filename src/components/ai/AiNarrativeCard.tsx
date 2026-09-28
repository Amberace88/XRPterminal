"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { TrustBadge } from "@/components/ui/Badge";
import { ErrorState, NotConnected, Skeleton } from "@/components/ui/States";
import { ClaimLabel } from "@/components/ui/Misc";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { AiNarrative, AiStatus } from "@/lib/intel/types";

const GROUPS: { key: keyof Pick<AiNarrative, "facts" | "analysis" | "historical_context" | "scenarios" | "risks" | "watch_items">; title: string; kind: "FACT" | "ANALYSIS" | "SCENARIO" }[] = [
  { key: "facts", title: "Facts (restated from data)", kind: "FACT" },
  { key: "analysis", title: "Analysis", kind: "ANALYSIS" },
  { key: "historical_context", title: "Historical context", kind: "ANALYSIS" },
  { key: "scenarios", title: "Scenarios", kind: "SCENARIO" },
  { key: "risks", title: "Risks", kind: "ANALYSIS" },
  { key: "watch_items", title: "What to watch", kind: "ANALYSIS" },
];

export function AiNarrativeCard({
  status,
  narrative,
  message,
  loading,
  error,
  onRetry,
  aiConfigured,
}: {
  status: AiStatus | null;
  narrative: AiNarrative | null;
  message?: string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  aiConfigured: boolean | null;
}) {
  const { tz } = usePreferences();
  return (
    <Card>
      <CardHeader title="AI narrative" icon={<Sparkles className="h-4 w-4" />} subtitle="Explains the structured data above — numbers come from code, not the model" actions={<TrustBadge kind="MODEL" />} />
      <CardBody>
        {aiConfigured === false || status === "not_configured" ? (
          <NotConnected what="AI provider not connected. The deterministic data brief is fully available without it." how="Set ANTHROPIC_API_KEY on the server to enable AI narratives (cached hourly)." className="py-6" />
        ) : loading && !narrative ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <p className="pt-1 text-2xs text-fg-muted">Generating narrative from the snapshot…</p>
          </div>
        ) : error || status === "error" ? (
          <ErrorState compact message={error ?? message} onRetry={onRetry} provider="AI provider" />
        ) : narrative ? (
          <div className="space-y-4">
            {narrative.summary && <p className="text-sm leading-relaxed text-fg">{narrative.summary}</p>}
            {GROUPS.filter((g) => narrative[g.key].length).map((g) => (
              <section key={g.key}>
                <h4 className="label mb-1.5">{g.title}</h4>
                <ul className="space-y-1.5">
                  {narrative[g.key].map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-secondary">
                      <span className="mt-0.5 shrink-0">
                        <ClaimLabel kind={g.kind} />
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section>
              <h4 className="label mb-1.5">Sources cited</h4>
              {narrative.sources.length ? (
                <ul className="space-y-1">
                  {narrative.sources.map((s) => (
                    <li key={s.url} className="text-2xs">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
                        {s.title} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-2xs text-fg-muted">Source unavailable — the narrative cites only the structured snapshot.</p>
              )}
            </section>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">No narrative yet.</p>
        )}
      </CardBody>
      {narrative && (
        <CardFooter>
          <span>
            {narrative.model} · {formatDateTime(narrative.generatedAt, tz)}
            {narrative.cached ? " · cached" : ""}
          </span>
          <span>Only URLs we supplied are allowed</span>
        </CardFooter>
      )}
    </Card>
  );
}
