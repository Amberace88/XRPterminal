"use client";

import { useEffect, useState } from "react";
import { Search, ShieldBan, ShieldCheck } from "lucide-react";
import { useApi, apiPost } from "@/hooks/useApi";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Modal";
import { Field, Stat } from "@/components/ui/Misc";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatDateTime } from "@/lib/format";
import { renderValue, StatusBadge, type Row } from "./common";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: "free" | "pro" | "proplus";
  subscription_status: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "deleted";
  created_at: string;
  updated_at: string;
  stripe_customer_id: string | null;
}

interface UserDetail {
  profile: UserRow & Record<string, unknown>;
  auth: { createdAt: string; lastSignInAt: string | null; emailConfirmedAt: string | null; providers: string[]; bannedUntil: string | null } | null;
  subscriptions: Row[];
  usage: Record<string, number | null>;
  connectedAccounts: Row[] | null;
  audit: { id: number; action: string; actor_id: string | null; created_at: string; metadata: Record<string, unknown> }[];
}

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ page: String(page) });
  if (debounced) params.set("q", debounced);
  if (plan) params.set("plan", plan);
  if (status) params.set("status", status);
  const { data, error, loading, reload } = useApi<{ users: UserRow[]; total: number; page: number; pageSize: number }>(`/api/admin/users?${params}`, { staleMs: 5_000 });

  const columns: Column<UserRow>[] = [
    {
      key: "email",
      header: "User",
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{u.email ?? <span className="text-fg-muted">(no email)</span>}</p>
          <p className="truncate text-2xs text-fg-muted">{u.display_name ?? u.id}</p>
        </div>
      ),
      value: (u) => u.email,
    },
    { key: "plan", header: "Plan", cell: (u) => <Badge tone={u.plan === "free" ? "neutral" : "accent"}>{u.plan === "proplus" ? "Pro+" : u.plan}</Badge>, value: (u) => u.plan },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} />, value: (u) => u.status, hideBelow: "sm" },
    { key: "role", header: "Role", cell: (u) => (u.role === "admin" ? <Badge tone="info">admin</Badge> : <span className="text-fg-muted">user</span>), value: (u) => u.role, hideBelow: "md" },
    { key: "created", header: "Joined", cell: (u) => <span className="num text-fg-secondary">{formatDate(u.created_at)}</span>, value: (u) => u.created_at, align: "right", hideBelow: "md" },
  ];

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Card>
      <CardHeader title="Users" subtitle={data ? `${data.total.toLocaleString("en-US")} matching` : "Search by email, name or user id"} />
      <div className="flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:px-5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input className="input h-9 pl-9" placeholder="Search email, name or id…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
        <select className="select h-9 sm:w-36" value={plan} onChange={(e) => {
            setPlan(e.target.value);
            setPage(0);
          }} aria-label="Filter by plan">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="proplus">Pro+</option>
        </select>
        <select className="select h-9 sm:w-40" value={status} onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <div className="mt-3">
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <DataTable rows={data?.users} loading={loading} columns={columns} rowKey={(u) => u.id} onRowClick={(u) => setSelected(u.id)} pageSize={25} empty={{ title: "No users found" }} />
        )}
      </div>
      {data && pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-2 text-2xs text-fg-muted">
          Page {page + 1} / {pages}
          <Button size="xs" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button size="xs" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
      <UserDrawer id={selected} onClose={() => setSelected(null)} onChanged={reload} />
    </Card>
  );
}

function UserDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<UserDetail>(id ? `/api/admin/users/${id}` : null, { staleMs: 0 });
  const toast = useToast();
  const [plan, setPlan] = useState<"free" | "pro" | "proplus">("free");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data?.profile) setPlan(data.profile.plan);
    setReason("");
  }, [data?.profile]);

  const act = async (body: Record<string, unknown>, label: string) => {
    if (!id) return;
    if (reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Every admin action needs a short reason for the audit log.", tone: "warning" });
      return;
    }
    setBusy(true);
    try {
      await apiPost(`/api/admin/users/${id}`, { ...body, reason: reason.trim() }, "PATCH");
      toast({ title: label, tone: "success" });
      reload();
      onChanged();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const p = data?.profile;
  return (
    <Drawer open={!!id} onClose={onClose} title="User">
      <div className="space-y-5 p-4">
        {loading && !data ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : p ? (
          <>
            <div>
              <p className="break-all text-sm font-medium text-fg">{p.email ?? "(no email)"}</p>
              <p className="break-all font-mono text-2xs text-fg-muted">{p.id}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={p.status} />
                <Badge tone={p.plan === "free" ? "neutral" : "accent"}>{p.plan}</Badge>
                {p.role === "admin" && <Badge tone="info">admin</Badge>}
              </div>
            </div>
            <div className="divide-y divide-border-subtle/60">
              <Stat label="Joined" value={formatDateTime(p.created_at)} />
              <Stat label="Last sign-in" value={data?.auth?.lastSignInAt ? formatDateTime(data.auth.lastSignInAt) : "—"} />
              <Stat label="Email verified" value={data?.auth?.emailConfirmedAt ? "yes" : "no"} />
              <Stat label="Sign-in methods" value={data?.auth?.providers.join(", ") || "—"} />
              <Stat label="Subscription" value={p.subscription_status ?? "—"} />
            </div>
            <div>
              <p className="label mb-2">Usage</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data?.usage ?? {}).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border-subtle p-2">
                    <p className="text-2xs text-fg-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
                    <p className="num text-sm text-fg">{v === null ? "n/a" : v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="label mb-2">Connected accounts (metadata only)</p>
              {data?.connectedAccounts === null ? (
                <p className="text-xs text-fg-muted">Table not available.</p>
              ) : data?.connectedAccounts?.length ? (
                <ul className="space-y-1.5">
                  {data.connectedAccounts.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border-subtle p-2 text-2xs text-fg-secondary">
                      {Object.entries(c)
                        .filter(([k]) => !["user_id"].includes(k))
                        .slice(0, 6)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-fg-muted">{k}</span>
                            <span className="truncate">{renderValue(v)}</span>
                          </div>
                        ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-muted">None.</p>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium text-fg">Actions</p>
              <Field label="Reason (required, audited)" htmlFor="admin-reason">
                <input id="admin-reason" className="input h-9" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <select className="select h-9 flex-1" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} aria-label="Plan">
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="proplus">Pro+</option>
                </select>
                <Button size="sm" variant="secondary" loading={busy} disabled={plan === p.plan} onClick={() => act({ action: "set_plan", plan }, "Plan updated")}>
                  Set plan
                </Button>
              </div>
              <p className="text-2xs text-fg-muted">Manual plan overrides are recomputed from Stripe on the user&apos;s next billing webhook.</p>
              {p.status === "suspended" ? (
                <Button size="sm" variant="success" loading={busy} onClick={() => act({ action: "restore" }, "Account restored")}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Restore account
                </Button>
              ) : (
                <Button size="sm" variant="danger" loading={busy} disabled={p.status === "deleted"} onClick={() => act({ action: "suspend" }, "Account suspended")}>
                  <ShieldBan className="h-3.5 w-3.5" /> Suspend account
                </Button>
              )}
            </div>

            <div>
              <p className="label mb-2">Audit events</p>
              {data?.audit.length ? (
                <ul className="space-y-1">
                  {data.audit.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2 text-2xs">
                      <span className="font-mono text-fg-secondary">{a.action}</span>
                      <span className="num text-fg-muted">{formatDateTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-muted">No audit events.</p>
              )}
            </div>
            <p className="text-2xs text-fg-muted">Seed phrases, private keys and plaintext API secrets are never stored or shown.</p>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
