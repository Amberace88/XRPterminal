"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import type { DataBrief } from "@/lib/intel/types";
import { KindLabel } from "./KindLabel";
import { SourcesPanel } from "./SourcesPanel";

/** Deterministic data brief — sections 1–11 with FACT / ANALYSIS / SCENARIO labels and sources. */
export function BriefView({ brief, compact = false, className }: { brief: DataBrief; compact?: boolean; className?: string }) {
  return (
    <div className={cn("grid gap-3", !compact && "md:grid-cols-2", className)}>
      {brief.sections.map((s) => (
        <Card key={s.id} className={cn("break-inside-avoid", (s.id === "news" || s.id === "snapshot") && !compact && "md:col-span-2")}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="num grid h-5 w-5 place-items-center rounded-md bg-accent/10 text-[10px] font-bold text-accent-strong">{s.n}</span>
                {s.title}
              </span>
            }
          />
          <CardBody>
            <ul className="space-y-2.5">
              {s.items.map((it, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    <KindLabel kind={it.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm leading-relaxed", it.kind === "UNAVAILABLE" ? "text-fg-muted" : "text-fg-secondary")}>{it.text}</p>
                    {it.sources.length > 0 && <SourcesPanel sources={it.sources} className="mt-1 print:hidden" />}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
