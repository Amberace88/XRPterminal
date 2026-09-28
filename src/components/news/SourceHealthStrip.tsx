"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils/cn";
import { formatAge } from "@/lib/format";
import type { NewsSourceHealth } from "@/lib/news/types";

const DOT = { HEALTHY: "bg-success", DEGRADED: "bg-warning", DOWN: "bg-danger" } as const;

/** Per-source health chips — a failing feed never hides the others (spec §153). */
export function SourceHealthStrip({ sources, className }: { sources: NewsSourceHealth[]; className?: string }) {
  const healthy = sources.filter((s) => s.status === "HEALTHY").length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="News source health">
      <span className="label mr-1">Sources {healthy}/{sources.length}</span>
      {sources.map((s) => (
        <Tooltip
          key={s.id}
          content={
            <span className="block space-y-0.5">
              <span className="block text-fg">{s.name}</span>
              <span className="block">Status: {s.status}{s.optional ? " (optional feed)" : ""}</span>
              <span className="block">Items kept: {s.keptCount}{s.itemCount ? ` of ${s.itemCount}` : ""}</span>
              {s.latencyMs !== undefined && <span className="block">Latency: {s.latencyMs} ms</span>}
              {s.lastSuccess && <span className="block">Last success: {formatAge(s.lastSuccess)}</span>}
              {s.message && <span className="block text-warning">{s.message}</span>}
            </span>
          }
        >
          <a
            href={s.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-2xs text-fg-secondary transition-colors hover:border-border hover:text-fg"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[s.status])} aria-hidden />
            {s.name}
            {s.id === "cointelegraph-xrp" && <span className="text-fg-muted">XRP tag</span>}
            <span className="num text-fg-muted">{s.keptCount}</span>
            <span className="sr-only">status {s.status}</span>
          </a>
        </Tooltip>
      ))}
    </div>
  );
}
