"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { ErrorState, NotConnected, SkeletonRows } from "@/components/ui/States";
import { formatDateTime, formatMoney, formatNumber, formatPct } from "@/lib/format";
import type { ProviderHealth, ProviderStatus } from "@/lib/types/market";
import type { RevenueMetrics } from "@/lib/billing/mapping";
import { StatusBadge } from "./common";

export interface OverviewData {
  users: { total: number | null; byPlan: { free: number | null; pro: number | null; proplus: number | null }; suspended: number | null; new7d: number | null; new30d: number | null };
  activity: { signedIn1d: number; signedIn7d: number; signedIn30d: number; scanned: number; truncated: boolean; productActive7d: number | null };
  subscriptions: { active: number | null; pastDue: number | null; canceled: number | null };
  system: { errors24h: number | null; jobsFailed: number | null; aiRequests24h: number | null };
  stripeConfigured: boolean;
  generatedAt: string;
}

export interface RevenueData {
  configured: boolean;
  metrics?: RevenueMetrics;
  trialConversion90d?: { started: number; converted: number } | null;
  scanned?: number;
  truncated?: boolean;
  livemode?: boolean | null;
  computedAt?: string;
  methodology?: string;
}

export interface ProvidersData {
  providers: ProviderHealth[];
  overall: ProviderStatus;
  checkedAt: number;
  cached: boolean;
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatNumber(v, 0));

export function AdminOverview() {
  const ov = useApi<OverviewData>("/api/admin/overview", { staleMs: 15_000 });
  const rev = useApi<RevenueData>("/api/admin/revenue", { staleMs: 60_000 });
  const prov = useApi<ProvidersData>("/api/health/providers", { staleMs: 30_000 });
  const d = ov.data;

  return (
    <div className="space-y-4">
      {ov.error ? (
        <Card>
          <ErrorState message={ov.error.message} onRetry={ov.reload} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Users" value={n(d?.users.total)} loading={!d} sub={d ? `${n(d.users.new7d)} new in 7d · ${n(d.users.new30d)} in 30d` : undefined} />
            <MetricCard
              label="Active users (signed in)"
              value={n(d?.activity.signedIn7d)}
              loading={!d}
              sub={d ? `1d ${n(d.activity.signedIn1d)} · 30d ${n(d.activity.signedIn30d)}${d.activity.truncated ? " · partial scan" : ""}` : undefined}
              info="Distinct accounts whose last sign-in falls in the window (Supabase Auth)."
            />
            <MetricCard label="Paid subscriptions" value={n(d?.subscriptions.active)} loading={!d} sub={d ? `${n(d.subscriptions.pastDue)} past due · ${n(d.subscriptions.canceled)} cancelled` : undefined} />
            <MetricCard
              label="Product-active (7d)"
              value={n(d?.activity.productActive7d)}
              loading={!d}
              sub="Analytics opt-in users only"
              info="Distinct signed-in users with at least one product event in 7 days. Only counts visitors who consented to analytics."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <CardHeader title="Plan distribution" subtitle="From profiles (Stripe-verified plans)" />
              <CardBody>
                {!d ? (
                  <SkeletonRows rows={3} />
                ) : (
                  <div className="space-y-3">
                    {(["free", "pro", "proplus"] as const).map((p) => {
                      const v = d.users.byPlan[p] ?? 0;
                      const total = d.users.total || 1;
                      return (
                        <div key={p}>
                          <div className="flex justify-between text-xs">
                            <span className="text-fg-secondary">{p === "proplus" ? "Pro+" : p === "pro" ? "Pro" : "Free"}</span>
                            <span className="num text-fg">
                              {n(v)} <span className="text-fg-muted">({formatPct((v / total) * 100, 1, false)})</span>
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(v / total) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-2xs text-fg-muted">
                      {n(d.users.suspended)} suspended · generated {formatDateTime(d.generatedAt)}
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="lg:col-span-7">
              <CardHeader
                title="Revenue"
                subtitle="Stripe is the billing source of truth"
                actions={
                  <Link href="/admin/revenue" className="text-xs text-accent-strong hover:underline">
                    Details →
                  </Link>
                }
              />
              <CardBody>
                {rev.loading && !rev.data ? (
                  <SkeletonRows rows={2} />
                ) : rev.error ? (
                  <ErrorState compact message={rev.error.message} onRetry={rev.reload} />
                ) : !rev.data?.configured ? (
                  <NotConnected what="Stripe is not configured (STRIPE_SECRET_KEY)." />
                ) : rev.data.metrics ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Mini label="MRR" value={formatMoney(rev.data.metrics.mrr, rev.data.metrics.currency ?? "EUR")} />
                    <Mini label="ARR" value={formatMoney(rev.data.metrics.arr, rev.data.metrics.currency ?? "EUR")} />
                    <Mini label="New (30d)" value={n(rev.data.metrics.newLast30d)} />
                    <Mini label="Churn (30d)" value={rev.data.metrics.churnRate30d === null ? "—" : formatPct(rev.data.metrics.churnRate30d * 100, 1, false)} />
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardHeader
                title="Provider health"
                subtitle={prov.data ? `Overall: ${prov.data.overall} · checked ${formatDateTime(prov.data.checkedAt)}${prov.data.cached ? " (cached)" : ""}` : "Active checks"}
                actions={
                  <Link href="/admin/providers" className="text-xs text-accent-strong hover:underline">
                    Details →
                  </Link>
                }
              />
              <CardBody>
                {prov.loading && !prov.data ? (
                  <SkeletonRows rows={5} />
                ) : prov.error ? (
                  <ErrorState compact message={prov.error.message} onRetry={prov.reload} />
                ) : (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {prov.data?.providers.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs">
                        <span className="truncate text-fg-secondary">{p.name}</span>
                        <StatusBadge status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card className="lg:col-span-5">
              <CardHeader title="System" actions={<Button size="xs" variant="ghost" onClick={ov.reload} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>} />
              <CardBody className="space-y-2">
                <Line label="Errors (24h)" value={n(d?.system.errors24h)} href="/admin/errors" />
                <Line label="Failed jobs" value={n(d?.system.jobsFailed)} href="/admin/jobs" />
                <Line label="AI requests (24h)" value={d?.system.aiRequests24h === null ? "table n/a" : n(d?.system.aiRequests24h)} href="/admin/ai" />
                <Line label="Stripe" value={d ? (d.stripeConfigured ? "configured" : "not configured") : "—"} href="/admin/system" />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary/50 p-3">
      <p className="label">{label}</p>
      <p className="num mt-1 text-lg font-semibold text-fg">{value}</p>
    </div>
  );
}

function Line({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">
      <span className="text-fg-secondary">{label}</span>
      <span className="num text-fg">{value}</span>
    </Link>
  );
}
