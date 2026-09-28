"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Hash, Stat } from "@/components/ui/Misc";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { formatDateTime, formatNumber } from "@/lib/format";
import { rippleTimeToMs } from "@/lib/format";
import { isLedgerIndex } from "@/lib/xrpl/address";
import { deliveredAmount, dropsToXrpString, formatAmount } from "@/lib/xrpl/amount";
import { useXrplQuery } from "@/lib/xrpl/hooks";
import { normalizeTxEnvelope } from "@/lib/xrpl/tx";
import type { Json, TxEnvelope } from "@/lib/xrpl/types";
import { typeBuckets } from "@/lib/xrpl/activity";
import { AccountRef, ResultBadge, TxLink, XrplErrorState } from "./shared";
import { ShareButton } from "./ShareButton";
import { useLabels } from "./useLabels";

interface LedgerResult {
  ledger: {
    ledger_index: number | string;
    ledger_hash?: string;
    parent_hash?: string;
    close_time?: number;
    close_time_iso?: string;
    total_coins?: string;
    transaction_hash?: string;
    account_hash?: string;
    close_time_resolution?: number;
    closed?: boolean;
    transactions?: Json[];
  };
  validated?: boolean;
}

export function LedgerView({ index }: { index: string }) {
  const valid = isLedgerIndex(index);
  const idx = valid ? Number(index) : null;
  const q = useXrplQuery<LedgerResult>(idx ? `ledger:${idx}` : null, (c) => c.request<LedgerResult>("ledger", { ledger_index: idx, transactions: true, expand: true }, 25_000));
  const { tz } = usePreferences();
  const { index: labels } = useLabels();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const txs = useMemo(() => {
    const list = (q.data?.ledger.transactions ?? []).map(normalizeTxEnvelope).filter((e): e is TxEnvelope => e !== null);
    return list.sort((a, b) => (a.meta?.TransactionIndex ?? 0) - (b.meta?.TransactionIndex ?? 0));
  }, [q.data]);
  const types = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of txs) m[t.tx.TransactionType] = (m[t.tx.TransactionType] ?? 0) + 1;
    return typeBuckets(m);
  }, [txs]);
  const shown = typeFilter ? txs.filter((t) => t.tx.TransactionType === typeFilter || (typeFilter.endsWith("*") && t.tx.TransactionType.startsWith(typeFilter.slice(0, -1)))) : txs;

  if (!valid) return <EmptyState title="Not a valid ledger index" description="Ledger indexes are positive whole numbers." />;
  if (q.error)
    return (
      <Card>
        {q.error.code === "lgrNotFound" ? (
          <EmptyState title="Ledger not available" description={`The connected server (${q.server ?? "unknown"}) does not have ledger ${idx}. It may be in the future or outside this server's history.`} />
        ) : (
          <XrplErrorState error={q.error} server={q.server} onRetry={q.reload} />
        )}
      </Card>
    );
  const L = q.data?.ledger;
  const closeMs = L ? (typeof L.close_time === "number" ? rippleTimeToMs(L.close_time) : L.close_time_iso ? Date.parse(L.close_time_iso) : null) : null;

  const cols: Column<TxEnvelope>[] = [
    { key: "i", header: "#", value: (e) => e.meta?.TransactionIndex ?? 0, cell: (e) => <span className="num text-2xs text-fg-muted">{e.meta?.TransactionIndex ?? "—"}</span> },
    { key: "type", header: "Type", value: (e) => e.tx.TransactionType, cell: (e) => <span className="text-xs text-fg">{e.tx.TransactionType}</span> },
    { key: "from", header: "Account", cell: (e) => <AccountRef address={e.tx.Account} labels={labels} head={5} tail={4} /> },
    { key: "to", header: "Destination", hideBelow: "md", cell: (e) => (e.tx.Destination ? <AccountRef address={e.tx.Destination} labels={labels} head={5} tail={4} /> : <span className="text-fg-muted">—</span>) },
    {
      key: "amt",
      header: "Delivered",
      align: "right",
      hideBelow: "sm",
      value: (e) => deliveredAmount(e.tx, e.meta).amount?.num ?? null,
      cell: (e) => {
        const a = deliveredAmount(e.tx, e.meta).amount;
        return a ? <span className="whitespace-nowrap text-xs">{formatAmount(a)}</span> : <span className="text-fg-muted">—</span>;
      },
    },
    { key: "res", header: "Result", hideBelow: "lg", value: (e) => e.meta?.TransactionResult ?? "", cell: (e) => <ResultBadge code={e.meta?.TransactionResult ?? "unknown"} /> },
    { key: "hash", header: "Hash", cell: (e) => <TxLink hash={e.hash} head={6} tail={4} /> },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={idx ? `Ledger #${idx.toLocaleString("en-US")}` : "Ledger"}
          icon={<Layers className="h-4 w-4" />}
          subtitle={q.server ? `from ${q.server}` : undefined}
          actions={
            <div className="flex items-center gap-1">
              {idx && idx > 1 && (
                <ButtonLink href={`/xrpl/ledger/${idx - 1}`} variant="ghost" size="xs" aria-label="Previous ledger">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </ButtonLink>
              )}
              {idx && (
                <ButtonLink href={`/xrpl/ledger/${idx + 1}`} variant="ghost" size="xs" aria-label="Next ledger">
                  <ChevronRight className="h-3.5 w-3.5" />
                </ButtonLink>
              )}
              <ShareButton title={`XRPL ledger ${idx}`} size="xs" />
            </div>
          }
        />
        <CardBody>
          {!L ? (
            <SkeletonRows rows={5} />
          ) : (
            <div className="grid gap-x-8 md:grid-cols-2">
              <div className="divide-y divide-border-subtle/60">
                <Stat label="Status" value={<Badge tone={q.data?.validated ? "success" : "warning"}>{q.data?.validated ? "Validated" : "Not validated"}</Badge>} />
                <Stat
                  label="Close time"
                  value={
                    <span className="flex flex-col items-end">
                      <span>{formatDateTime(closeMs, "UTC")}</span>
                      <span className="text-2xs text-fg-muted">{formatDateTime(closeMs, tz)}</span>
                    </span>
                  }
                />
                <Stat label="Transactions" value={txs.length} />
                <Stat label="Total XRP in existence" value={L.total_coins ? `${formatNumber(Number(dropsToXrpString(L.total_coins)), 2)} XRP` : "—"} />
              </div>
              <div className="divide-y divide-border-subtle/60">
                <Stat label="Ledger hash" value={L.ledger_hash ? <Hash value={L.ledger_hash} head={8} tail={6} /> : "—"} />
                <Stat
                  label="Parent"
                  value={
                    L.parent_hash && idx ? (
                      <Link href={`/xrpl/ledger/${idx - 1}`} className="font-mono text-xs text-accent-strong hover:underline">
                        #{(idx - 1).toLocaleString("en-US")}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <Stat label="Tx tree hash" value={L.transaction_hash ? <Hash value={L.transaction_hash} head={8} tail={6} /> : "—"} />
                <Stat label="Close time resolution" value={L.close_time_resolution ? `${L.close_time_resolution}s` : "—"} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Transactions" subtitle="In canonical ledger order" />
        <CardBody className="space-y-3 px-0 sm:px-0">
          {types.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 sm:px-5" role="group" aria-label="Filter by type">
              <button onClick={() => setTypeFilter(null)} className={`rounded-md border px-2 py-0.5 text-2xs ${typeFilter === null ? "border-accent/50 bg-accent/10 text-fg" : "border-border-subtle text-fg-muted hover:text-fg"}`}>
                All {txs.length}
              </button>
              {types.map((t) => (
                <button
                  key={t.type}
                  onClick={() => setTypeFilter(t.type === typeFilter ? null : t.type)}
                  className={`rounded-md border px-2 py-0.5 text-2xs ${typeFilter === t.type ? "border-accent/50 bg-accent/10 text-fg" : "border-border-subtle text-fg-muted hover:text-fg"}`}
                >
                  {t.type} {t.count}
                </button>
              ))}
            </div>
          )}
          <DataTable rows={L ? shown : undefined} loading={!L} columns={cols} rowKey={(e) => e.hash} pageSize={50} csvName={idx ? `xrpl-ledger-${idx}` : undefined} empty={{ title: "No transactions in this ledger" }} />
        </CardBody>
      </Card>
    </div>
  );
}
