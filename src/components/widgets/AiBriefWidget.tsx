"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { KindLabel } from "@/components/ai/KindLabel";
import { useApi } from "@/hooks/useApi";
import { formatAge } from "@/lib/format";
import type { BriefApiResponse } from "@/components/ai/types";

const PICK = ["snapshot", "changed", "risks", "watch"];

/** Dashboard widget: deterministic daily brief summary + AI provider status. */
export function AiBriefWidget({ className }: { className?: string }) {
  const { data, error, loading, reload } = useApi<BriefApiResponse>("/api/ai/brief?type=daily", { refreshMs: 15 * 60_000, staleMs: 5 * 60_000 });
  const items = (data?.brief.sections ?? [])
    .filter((s) => PICK.includes(s.id))
    .map((s) => s.items.find((i) => i.kind !== "UNAVAILABLE"))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .slice(0, 4);
  return (
    <Card className={className}>
      <CardHeader
        title="Daily brief"
        icon={<Sparkles className="h-4 w-4" />}
        subtitle={data?.brief.headline ?? "Structured data brief"}
        actions={
          <Link href="/ai" className="text-xs text-accent-strong hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="max-h-[260px] overflow-y-auto">
        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : error && !data ? (
          <ErrorState compact message={error.message} onRetry={reload} />
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-fg-secondary">
                <span className="mt-0.5 shrink-0">
                  <KindLabel kind={it.kind} />
                </span>
                <span className="line-clamp-3">{it.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <span>{data ? `Built ${formatAge(data.brief.generatedAt)}` : "—"}</span>
        {data && (data.aiConfigured ? <Badge tone="success">AI narrative available</Badge> : <Badge tone="neutral">AI provider not connected</Badge>)}
      </CardFooter>
    </Card>
  );
}
