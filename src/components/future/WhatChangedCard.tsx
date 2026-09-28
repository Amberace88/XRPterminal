"use client";

import { GitCompareArrows } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/utils/cn";
import type { WhatChanged } from "@/lib/forecast/changes";

export function WhatChangedCard({ changes, className }: { changes: WhatChanged | null; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="What changed"
        icon={<GitCompareArrows className="h-4 w-4" />}
        subtitle={
          changes
            ? `vs ${changes.previous.source === "published" ? "previous published forecast" : "model re-run with data up to"} ${changes.previous.asOfDate}`
            : undefined
        }
        info="Compares this forecast with the previous published one. Without a database, the model is re-run as of 7 days earlier using only data available then. Explanations are generated deterministically from the numbers."
      />
      <CardBody>
        {!changes ? (
          <EmptyState title="No earlier forecast to compare" description="There is not enough history before the as-of date to re-run the model one week earlier." />
        ) : (
          <>
            <p className="mb-3 text-sm text-fg-secondary">{changes.summary}</p>
            <ul className="divide-y divide-border-subtle">
              {changes.items.map((it) => (
                <li key={it.kind} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{it.title}</span>
                    <Badge tone={it.changed ? "accent" : "neutral"}>{it.changed ? "Changed" : "Stable"}</Badge>
                  </div>
                  <div className="num mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-fg-muted">{it.before}</span>
                    <span className="text-fg-muted" aria-hidden>
                      →
                    </span>
                    <span className={cn(it.changed ? "text-fg" : "text-fg-muted")}>{it.after}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{it.explanation}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}
