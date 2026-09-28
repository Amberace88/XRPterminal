"use client";

import { useMemo, useState } from "react";
import { EyeOff, RefreshCw, RotateCcw, Check, X, Eye } from "lucide-react";
import { useApi, apiPost } from "@/hooks/useApi";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Switch } from "@/components/ui/Misc";
import { EmptyState, ErrorState, NotConnected, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { summarizeAiUsage } from "@/lib/admin/guard";
import type { ProviderHealth } from "@/lib/types/market";
import { AdminTableCard, StatusBadge, type Row, type TableResponse } from "./common";
import type { ProvidersData, RevenueData } from "./AdminOverview";

/* ------------------------------------------------------------------ Revenue */
export function AdminRevenue() {
  const { data, error, loading, reload } = useApi<RevenueData>("/api/admin/revenue", { staleMs: 60_000 });
  if (loading && !data) return <SkeletonRows rows={6} />;
  if (error) return <Card><ErrorState message={error.message} onRetry={reload} /></Card>;
  if (!data?.configured || !data.metrics)
    return (
      <Card>
        <NotConnected what="Stripe is not configured, so revenue metrics are unavailable." how="Set STRIPE_SECRET_KEY, price ids and the webhook secret — see docs/DEPLOYMENT.md." />
      </Card>
    );
  const m = data.metrics;
  const cur = m.currency ?? "EUR";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="MRR" value={formatMoney(m.mrr, cur)} sub={m.mixedCurrencies ? "Mixed currencies — summed without conversion" : cur} />
        <MetricCard label="ARR" value={formatMoney(m.arr, cur)} sub="MRR × 12" />
        <MetricCard label="Active subscriptions" value={formatNumber(m.activeSubscriptions, 0)} sub={`${m.trialing} trialing · ${m.pastDue} past due`} />
        <MetricCard label="Churn (30d)" value={m.churnRate30d === null ? "—" : formatPct(m.churnRate30d * 100, 1, false)} sub={`${m.cancelledLast30d} cancelled · ${m.newLast30d} new`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Plan distribution" subtitle="Active and past-due subscription items by price" />
          <CardBody className="space-y-2">
            {Object.keys(m.planDistribution).length === 0 ? (
              <EmptyState title="No active subscriptions yet" />
            ) : (
              Object.entries(m.planDistribution).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-fg-secondary">{k === "proplus" ? "Pro+" : k === "pro" ? "Pro" : "Other price"}</span>
                  <span className="num text-fg">{v}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Trial conversion (90d)" actions={<Button size="xs" variant="ghost" onClick={reload} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>} />
          <CardBody>
            {data.trialConversion90d ? (
              <p className="text-sm text-fg">
                {data.trialConversion90d.converted} of {data.trialConversion90d.started} trials converted (
                {formatPct((data.trialConversion90d.converted / data.trialConversion90d.started) * 100, 1, false)})
              </p>
            ) : (
              <p className="text-sm text-fg-muted">No trials started in the last 90 days.</p>
            )}
            <p className="mt-3 text-2xs leading-relaxed text-fg-muted">{data.methodology}</p>
            <p className="mt-2 text-2xs text-fg-muted">
              {data.scanned} subscriptions scanned{data.truncated ? " (truncated)" : ""} · {data.livemode === false ? "TEST MODE" : data.livemode ? "live mode" : ""} · computed{" "}
              {data.computedAt ? formatDateTime(data.computedAt) : "—"}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Subscriptions */
export function AdminSubscriptions() {
  return (
    <AdminTableCard
      table="subscriptions"
      title="Subscriptions"
      subtitle="Written only by the verified Stripe webhook"
      preferred={["user_id", "plan", "status", "current_period_end", "cancel_at_period_end", "stripe_subscription_id", "updated_at"]}
      params="&limit=500"
      empty="No subscriptions yet."
    />
  );
}

/* ------------------------------------------------------------------ Providers */
export function AdminProviders() {
  const [fresh, setFresh] = useState(0);
  const url = `/api/health/providers${fresh ? `?fresh=1&n=${fresh}` : ""}`;
  const { data, error, loading, reload } = useApi<ProvidersData>(url, { staleMs: 30_000 });
  const columns: Column<ProviderHealth>[] = [
    { key: "name", header: "Provider", cell: (p) => <span className="text-fg">{p.name}</span>, value: (p) => p.name },
    { key: "kind", header: "Kind", cell: (p) => <Badge>{p.kind}</Badge>, value: (p) => p.kind, hideBelow: "sm" },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} />, value: (p) => p.status },
    { key: "latency", header: "Latency", align: "right", cell: (p) => (p.latencyMs != null ? `${p.latencyMs} ms` : "—"), value: (p) => p.latencyMs ?? null },
    { key: "message", header: "Detail", cell: (p) => <span className="block max-w-[340px] truncate text-xs text-fg-muted" title={p.message}>{p.message ?? "—"}</span>, hideBelow: "md" },
  ];
  return (
    <Card>
      <CardHeader
        title="Provider health"
        subtitle={data ? `Overall ${data.overall} · checked ${formatDateTime(data.checkedAt)}${data.cached ? " · cached ≤60s" : ""}` : "Market venues, XRPL servers, CoinGecko, ECB FX, news RSS, AI, billing, database"}
        actions={
          <Button size="sm" variant="secondary" loading={loading} onClick={() => setFresh((f) => f + 1)}>
            <RefreshCw className="h-3.5 w-3.5" /> Run checks
          </Button>
        }
      />
      <div className="mt-3">
        {error ? <ErrorState message={error.message} onRetry={reload} /> : <DataTable rows={data?.providers} loading={loading && !data} columns={columns} rowKey={(p) => p.id} />}
      </div>
      <p className="px-5 pb-4 pt-2 text-2xs text-fg-muted">AI and billing providers are not pinged (cost control) and report UNKNOWN with their configuration state. Nothing here is estimated.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ Jobs */
export function AdminJobs() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const retry = async (name: string) => {
    setBusy(name);
    try {
      await apiPost("/api/admin/jobs", { name });
      toast({ title: `Job "${name}" triggered`, tone: "success" });
    } catch (e) {
      toast({ title: "Retry failed", description: e instanceof Error ? e.message : "", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <AdminTableCard
      table="system_jobs"
      title="Jobs"
      subtitle="Scheduled jobs report each run via runRecordedJob() — last run, next run, duration, status, errors"
      preferred={["name", "status", "last_run", "next_run", "duration_ms", "run_count", "error_count", "last_error"]}
      empty="No job runs recorded yet. Jobs appear here after their first run."
      extraColumns={[
        {
          key: "retry",
          header: "",
          align: "right",
          cell: (r: Row) =>
            r.safe_to_retry ? (
              <Button size="xs" variant="secondary" loading={busy === r.name} onClick={() => retry(String(r.name))}>
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            ) : (
              <span className="text-2xs text-fg-muted">manual</span>
            ),
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ Errors */
export function AdminErrors() {
  return (
    <AdminTableCard
      table="error_events"
      title="Errors"
      subtitle="Grouped by fingerprint · client error boundaries, server routes, jobs and webhooks"
      preferred={["source", "message", "path", "count", "last_seen", "first_seen"]}
      params="&limit=300"
      empty="No errors recorded."
    />
  );
}

/* ------------------------------------------------------------------ AI usage */
export function AdminAi() {
  const { data, error, loading, reload } = useApi<TableResponse>("/api/admin/data?table=ai_usage&limit=1000&sinceDays=30", { staleMs: 30_000 });
  const summary = useMemo(() => (data?.available ? summarizeAiUsage(data.rows) : null), [data]);
  if (loading && !data) return <SkeletonRows rows={6} />;
  if (error) return <Card><ErrorState message={error.message} onRetry={reload} /></Card>;
  if (!data?.available || !summary) return <Card><EmptyState title="AI usage not available" description={data?.message ?? "The ai_usage table (0060) has not been created yet."} /></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Requests (30d)" value={formatNumber(summary.requests, 0)} sub={data.rows.length >= 1000 ? "latest 1,000 rows" : undefined} />
        <MetricCard label="Tokens in / out" value={`${formatNumber(summary.inputTokens, 0)} / ${formatNumber(summary.outputTokens, 0)}`} size="sm" />
        <MetricCard label={summary.costIsEstimate ? "Cost (estimate)" : "Cost"} value={formatMoney(summary.estimatedCostUsd, "USD")} sub={summary.costIsEstimate ? "From token counts × list price assumption" : "From recorded cost"} />
        <MetricCard label="Errors · avg latency" value={`${summary.errors} · ${summary.avgLatencyMs != null ? `${summary.avgLatencyMs} ms` : "—"}`} size="sm" />
      </div>
      <Card>
        <CardHeader title="Top features" subtitle="Prompt contents are not shown" />
        <div className="mt-3">
          <DataTable
            rows={summary.byFeature}
            rowKey={(r) => r.feature}
            columns={[
              { key: "feature", header: "Feature", cell: (r) => r.feature, value: (r) => r.feature },
              { key: "requests", header: "Requests", align: "right", cell: (r) => formatNumber(r.requests, 0), value: (r) => r.requests },
              { key: "tokens", header: "Tokens", align: "right", cell: (r) => formatNumber(r.tokens, 0), value: (r) => r.tokens },
            ]}
            empty={{ title: "No AI requests in the last 30 days" }}
          />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Forecasts */
export function AdminForecasts() {
  return (
    <AdminTableCard
      table="forecasts"
      title="Forecasts"
      subtitle="Published forecasts are immutable (0030) — this view is read-only"
      preferred={["id", "horizon", "horizon_days", "model_version", "model_id", "published_at", "created_at", "status"]}
      params="&limit=200"
      empty="No forecasts published yet."
    />
  );
}

/* ------------------------------------------------------------------ Moderation */
export function AdminModeration() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const act = async (id: unknown, action: "resolve" | "dismiss" | "hide_content" | "restore_content") => {
    const note = window.prompt(`Note for the audit log (${action.replace("_", " ")}):`) ?? undefined;
    setBusy(`${id}:${action}`);
    try {
      const r = await apiPost<{ done: boolean; warnings: string[] }>("/api/admin/moderation", { reportId: id as string | number, action, note });
      toast({ title: r.done ? "Moderation action applied" : "Partially applied", description: r.warnings.join(" "), tone: r.done ? "success" : "warning" });
      setNonce((n) => n + 1);
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <AdminTableCard
      key={nonce}
      table="social_reports"
      title="Moderation queue"
      subtitle="Reports: scam, fraud, impersonation, misinformation, harassment, spam, fake performance. Every action is audited."
      preferred={["category", "reason", "status", "target_type", "target_id", "post_id", "reporter_id", "created_at"]}
      params="&limit=300"
      empty="No reports."
      extraColumns={[
        {
          key: "actions",
          header: "",
          align: "right",
          cell: (r: Row) => (
            <div className="flex justify-end gap-1">
              <Button size="xs" variant="ghost" title="Resolve" loading={busy === `${r.id}:resolve`} onClick={() => act(r.id, "resolve")}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="xs" variant="ghost" title="Dismiss" loading={busy === `${r.id}:dismiss`} onClick={() => act(r.id, "dismiss")}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="xs" variant="ghost" title="Hide content" loading={busy === `${r.id}:hide_content`} onClick={() => act(r.id, "hide_content")}>
                <EyeOff className="h-3 w-3" />
              </Button>
              <Button size="xs" variant="ghost" title="Restore content" loading={busy === `${r.id}:restore_content`} onClick={() => act(r.id, "restore_content")}>
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ Audit */
export function AdminAudit() {
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState("");
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(action.trim());
        }}
      >
        <input className="input h-9 max-w-xs" placeholder="Filter by action prefix, e.g. admin. or auth." value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action prefix" />
        <Button size="sm" variant="secondary" type="submit">
          Filter
        </Button>
      </form>
      <AdminTableCard
        key={applied}
        table="audit_logs"
        title="Audit log"
        subtitle="Append-only. Sensitive actions: sign-ins, password changes, subscriptions, exports, deletions, admin & moderation actions."
        preferred={["created_at", "action", "actor_id", "user_id", "target_type", "target_id", "metadata"]}
        params={`&limit=500${applied ? `&action=${encodeURIComponent(applied)}` : ""}`}
        empty="No audit events."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ System */
interface HealthData {
  status: string;
  time: string;
  durationMs: number;
  region: string | null;
  commit: string | null;
  checks: {
    api: { status: string };
    database: { status: string; latencyMs?: number; message?: string };
    marketProviders: { id: string; status: string; latencyMs?: number; lastSuccess?: number }[];
    configuration: Record<string, boolean>;
  };
}

export function AdminSystem() {
  const { data, error, loading, reload } = useApi<HealthData>("/api/health", { staleMs: 10_000 });
  const flags = useApi<TableResponse>("/api/admin/data?table=feature_flags", { staleMs: 5_000 });
  const toast = useToast();
  const toggle = async (key: string, enabled: boolean) => {
    try {
      await apiPost("/api/admin/flags", { key, enabled });
      toast({ title: `Flag ${key} ${enabled ? "enabled" : "disabled"}`, tone: "success" });
      flags.reload();
    } catch (e) {
      toast({ title: "Flag not changed", description: e instanceof Error ? e.message : "", tone: "danger" });
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="System health" subtitle={data ? `Checked ${formatDateTime(data.time)} in ${data.durationMs} ms` : "/api/health"} actions={<Button size="xs" variant="ghost" onClick={reload} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>} />
        <CardBody>
          {loading && !data ? (
            <SkeletonRows rows={6} />
          ) : error ? (
            <ErrorState compact message={error.message} onRetry={reload} />
          ) : data ? (
            <div className="space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-fg-secondary">API</span><StatusBadge status={data.checks.api.status} /></div>
              <div className="flex justify-between gap-3">
                <span className="text-fg-secondary">Database</span>
                <span className="flex items-center gap-2">
                  {data.checks.database.latencyMs != null && <span className="num text-2xs text-fg-muted">{data.checks.database.latencyMs} ms</span>}
                  <StatusBadge status={data.checks.database.status} />
                </span>
              </div>
              {data.checks.database.message && <p className="text-2xs text-fg-muted">{data.checks.database.message}</p>}
              <div>
                <p className="label mb-1.5">Market providers (this instance, from real traffic)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {data.checks.marketProviders.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border border-border-subtle px-2 py-1 text-xs">
                      <span className="text-fg-secondary">{m.id}</span>
                      <StatusBadge status={m.status} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="label mb-1.5">Configuration</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(data.checks.configuration).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between rounded-lg border border-border-subtle px-2 py-1 text-xs">
                      <span className="text-fg-secondary">{k}</span>
                      {v ? <Badge tone="success">set</Badge> : <Badge>missing</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-2xs text-fg-muted">
                Region {data.region ?? "—"} · commit {data.commit ?? "—"} · Queue/cron status: see Jobs. Storage usage: see the Supabase dashboard.
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Feature flags" subtitle="BETA features are labelled in the UI. The live trading bridge can never be enabled." />
        <CardBody>
          {flags.loading && !flags.data ? (
            <SkeletonRows rows={5} />
          ) : flags.error ? (
            <ErrorState compact message={flags.error.message} onRetry={flags.reload} />
          ) : !flags.data?.available ? (
            <EmptyState title="Flags table not available" description={flags.data?.message} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {flags.data.rows.map((f) => (
                <li key={String(f.key)} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-fg">
                      {String(f.key)} <StatusBadge status={String(f.status)} />
                    </p>
                    <p className="truncate text-2xs text-fg-muted">{String(f.description ?? "")}</p>
                  </div>
                  <Switch label={`Toggle ${String(f.key)}`} checked={!!f.enabled} disabled={f.key === "liveTradingBridge"} onChange={(v) => toggle(String(f.key), v)} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
