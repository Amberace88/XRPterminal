"use client";

import Link from "next/link";
import { BellRing, Plus } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { planOf } from "@/lib/entitlements";
import { formatAge } from "@/lib/format";
import { useAlerts } from "@/components/alerts/useAlerts";

/** Dashboard widget: active rules count, last triggers, create CTA. */
export function AlertsWidget({ className }: { className?: string }) {
  const { plan } = useAuth();
  const { rules, events, loading, error, mode } = useAlerts();
  const active = rules?.filter((r) => r.enabled).length ?? 0;
  return (
    <Card className={className}>
      <CardHeader
        title="Alerts"
        icon={<BellRing className="h-4 w-4" />}
        subtitle={rules ? `${active} active · ${rules.length}/${planOf(plan).limits.alerts} rules` : "Price, wallet, news & regime alerts"}
        actions={
          <Link href="/alerts" className="text-xs text-accent-strong hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="max-h-[240px] overflow-y-auto">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : !rules?.length ? (
          <EmptyState
            title="No alerts yet"
            description="Get notified when XRP crosses a price, a wallet moves XRP or a regulation headline appears."
            action={
              <ButtonLink href="/alerts" size="sm">
                <Plus className="h-4 w-4" /> Create alert
              </ButtonLink>
            }
            className="py-4"
          />
        ) : !events?.length ? (
          <p className="text-xs text-fg-muted">No alerts triggered yet. Rules are evaluated while XRP Terminal is open.</p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-fg">{e.title}</div>
                  <div className="truncate text-2xs text-fg-muted">{e.body}</div>
                </div>
                <span className="shrink-0 text-2xs text-fg-muted">{formatAge(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <span>{mode === "local" ? "Guest mode — this browser only" : "Synced to your account"}</span>
        {active > 0 && <Badge tone="success" dot>Live</Badge>}
      </CardFooter>
    </Card>
  );
}
