"use client";

import { useMemo, useState } from "react";
import { Braces, RefreshCw } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";
import type { ProviderStatus } from "@/lib/types/market";

export type Row = Record<string, unknown>;

export interface TableResponse {
  table: string;
  available: boolean;
  rows: Row[];
  message?: string;
}

export function StatusBadge({ status }: { status: ProviderStatus | string | null | undefined }) {
  const s = String(status ?? "UNKNOWN").toUpperCase();
  const tone =
    s === "HEALTHY" || s === "SUCCESS" || s === "ACTIVE" || s === "OK" || s === "LIVE" || s === "RESOLVED"
      ? "success"
      : s === "DEGRADED" || s === "PAST_DUE" || s === "RUNNING" || s === "BETA" || s === "OPEN" || s === "PENDING" || s === "TRIALING"
        ? "warning"
        : s === "DOWN" || s === "FAILED" || s === "SUSPENDED" || s === "CANCELED" || s === "UNPAID"
          ? "danger"
          : "neutral";
  return <Badge tone={tone} dot>{s.replace(/_/g, " ")}</Badge>;
}

const isIsoDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);

export function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-fg-muted">—</span>;
  if (typeof v === "boolean") return v ? <span className="text-success">yes</span> : <span className="text-fg-muted">no</span>;
  if (isIsoDate(v)) return <span className="num whitespace-nowrap text-fg-secondary">{formatDateTime(v as string)}</span>;
  if (typeof v === "number") return <span className="num">{v.toLocaleString("en-US")}</span>;
  if (typeof v === "object") return <span className="font-mono text-2xs text-fg-muted">{JSON.stringify(v).slice(0, 80)}</span>;
  const s = String(v);
  return <span className="block max-w-[320px] truncate" title={s}>{s}</span>;
}

/** Generic, schema-tolerant table for admin data. Shows preferred columns when present. */
export function GenericRows({
  rows,
  preferred,
  csvName,
  extraColumns = [],
  empty = "No records yet.",
}: {
  rows: Row[];
  preferred: string[];
  csvName: string;
  extraColumns?: Column<Row>[];
  empty?: string;
}) {
  const [detail, setDetail] = useState<Row | null>(null);
  const keys = useMemo(() => {
    const present = new Set(rows.flatMap((r) => Object.keys(r)));
    const pick = preferred.filter((k) => present.has(k));
    if (pick.length >= 2) return pick;
    return [...present].slice(0, 6);
  }, [rows, preferred]);
  const columns: Column<Row>[] = [
    ...keys.map<Column<Row>>((k) => ({
      key: k,
      header: k.replace(/_/g, " "),
      cell: (r) => renderValue(r[k]),
      value: (r) => {
        const v = r[k];
        return typeof v === "number" || typeof v === "string" ? v : v == null ? null : JSON.stringify(v);
      },
    })),
    ...extraColumns,
    {
      key: "__json",
      header: "",
      align: "right",
      cell: (r) => (
        <button className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg" aria-label="View record" onClick={() => setDetail(r)}>
          <Braces className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];
  return (
    <>
      <DataTable rows={rows} columns={columns} rowKey={(r, i) => String(r.id ?? r.name ?? r.key ?? i)} csvName={csvName} empty={{ title: empty }} pageSize={25} />
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Record" size="lg">
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-bg-secondary p-3 text-2xs leading-relaxed text-fg-secondary">{JSON.stringify(detail, null, 2)}</pre>
      </Modal>
    </>
  );
}

/** Card that loads one admin table via /api/admin/data. */
export function AdminTableCard({
  table,
  title,
  subtitle,
  preferred,
  params = "",
  extraColumns,
  empty,
  headerActions,
}: {
  table: string;
  title: string;
  subtitle?: string;
  preferred: string[];
  params?: string;
  extraColumns?: Column<Row>[];
  empty?: string;
  headerActions?: React.ReactNode;
}) {
  const { data, error, loading, reload } = useApi<TableResponse>(`/api/admin/data?table=${table}${params}`, { staleMs: 5_000 });
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {headerActions}
            <Button variant="ghost" size="xs" onClick={reload} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />
      <div className="mt-3">
        {loading && !data ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : data && !data.available ? (
          <EmptyState title="Not available yet" description={data.message} />
        ) : (
          <GenericRows rows={data?.rows ?? []} preferred={preferred} csvName={table} extraColumns={extraColumns} empty={empty} />
        )}
      </div>
    </Card>
  );
}
