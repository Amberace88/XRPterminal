"use client";

import { BadgeCheck, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { NewsEvent } from "@/lib/news/types";
import { CATEGORY_LABEL, CATEGORY_TONE } from "./categories";

/** Event intelligence (spec §78) — only from real clusters; confirmed-by-multiple vs single source. */
export function EventIntelligence({ events, className }: { events: NewsEvent[]; className?: string }) {
  const { tz } = usePreferences();
  return (
    <Card className={className}>
      <CardHeader
        title="Event intelligence"
        subtitle="Regulatory, institutional & XRPL developments from the news clusters"
        info="Events are derived only from published news clusters in the Regulation, Institutional and XRPL categories. The date shown is when the first report was published — not an event date. Multiple independent publishers ≠ confirmation of the underlying facts."
      />
      <CardBody className="space-y-2.5">
        {events.length === 0 ? (
          <EmptyState title="No developments in the current window" description="Nothing in these categories from the connected sources right now." className="py-6" />
        ) : (
          events.map((e) => (
            <div key={e.clusterId} className="rounded-lg border border-border-subtle p-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={CATEGORY_TONE[e.category]}>{CATEGORY_LABEL[e.category]}</Badge>
                {e.verification === "MULTI_SOURCE" ? (
                  <Badge tone="info">
                    <BadgeCheck className="h-3 w-3" /> {e.label}
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <TriangleAlert className="h-3 w-3" /> {e.label}
                  </Badge>
                )}
              </div>
              <a href={e.links[0]?.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium leading-snug text-fg hover:text-accent-strong hover:underline">
                {e.title}
              </a>
              <p className="mt-1 text-2xs text-fg-muted">
                First reported {formatDateTime(e.firstReportedAt, tz)} · {[...new Set(e.links.map((l) => l.source))].join(", ")}
              </p>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
