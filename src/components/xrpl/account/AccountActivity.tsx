"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatAmount } from "@/lib/xrpl/amount";
import type { LabelIndex } from "@/lib/xrpl/labels";
import { filterTimeline, toTimelineItem, type TimelineCategory, type TimelineItem } from "@/lib/xrpl/wallet";
import { AccountRef, ResultBadge, TxLink, XrplErrorState } from "../shared";
import type { AccountTxState } from "./useAccountData";

const FILTERS: { value: TimelineCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "payment", label: "Payments" },
  { value: "offer", label: "Offers" },
  { value: "trustline", label: "Trust lines" },
  { value: "token", label: "Tokens" },
  { value: "large", label: "Large transfers" },
];

const LARGE = [10_000, 100_000, 1_000_000];

export function AccountActivity({ address, tx, labels }: { address: string; tx: AccountTxState; labels: LabelIndex }) {
  const { tz } = usePreferences();
  const [filter, setFilter] = useState<TimelineCategory | "all">("all");
  const [large, setLarge] = useState(100_000);
  const items = useMemo(() => tx.envs.map((e) => toTimelineItem(e, address, large)), [tx.envs, address, large]);
  const shown = useMemo(() => filterTimeline(items, filter), [items, filter]);

  const columns: Column<TimelineItem>[] = [
    {
      key: "time",
      header: "Time",
      value: (r) => r.timeMs ?? 0,
      cell: (r) => <span className="num whitespace-nowrap text-2xs text-fg-secondary">{formatDateTime(r.timeMs, tz, false)}</span>,
    },
    {
      key: "type",
      header: "Type",
      value: (r) => r.type,
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-xs text-fg">
            {r.direction === "in" ? (
              <ArrowDownLeft className="h-3.5 w-3.5 text-success" aria-label="incoming" />
            ) : r.direction === "out" ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-danger" aria-label="outgoing" />
            ) : (
              <ArrowRightLeft className="h-3.5 w-3.5 text-fg-muted" aria-label="other" />
            )}
            {r.type}
          </span>
          {r.result !== "tesSUCCESS" && <ResultBadge code={r.result} className="w-fit" />}
        </span>
      ),
    },
    {
      key: "cp",
      header: "Counterparty",
      hideBelow: "md",
      cell: (r) => (r.counterparty ? <AccountRef address={r.counterparty} labels={labels} /> : <span className="text-fg-muted">—</span>),
    },
    {
      key: "amount",
      header: "Delivered",
      align: "right",
      value: (r) => r.amount?.num ?? null,
      cell: (r) => (r.amount ? <span className="whitespace-nowrap text-xs">{formatAmount(r.amount)}</span> : <span className="text-fg-muted">—</span>),
    },
    {
      key: "delta",
      header: "XRP Δ",
      align: "right",
      hideBelow: "sm",
      value: (r) => r.xrpDelta,
      cell: (r) => (
        <span className={cn("whitespace-nowrap text-xs", r.xrpDelta > 0 ? "text-success" : r.xrpDelta < 0 ? "text-danger" : "text-fg-muted")}>
          {r.xrpDelta > 0 ? "+" : ""}
          {formatNumber(r.xrpDelta, 6)}
        </span>
      ),
    },
    { key: "hash", header: "Tx", hideBelow: "lg", value: (r) => r.hash, cell: (r) => <TxLink hash={r.hash} head={6} tail={4} /> },
  ];

  return (
    <Card id="activity">
      <CardHeader
        title="Activity timeline"
        icon={<History className="h-4 w-4" />}
        subtitle={`Newest first · ${tx.envs.length} transactions fetched${tx.hasMore ? " (more available)" : " (complete history)"}`}
      />
      <CardBody className="space-y-3 px-0 sm:px-0">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5">
          <Tabs value={filter} onChange={setFilter} items={FILTERS} size="xs" ariaLabel="Filter activity" />
          {filter === "large" && (
            <label className="flex items-center gap-1.5 text-2xs text-fg-muted">
              ≥
              <select className="select h-7 text-2xs" value={large} onChange={(e) => setLarge(Number(e.target.value))} aria-label="Large transfer threshold">
                {LARGE.map((v) => (
                  <option key={v} value={v}>
                    {v.toLocaleString("en-US")} XRP
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {tx.error && !tx.envs.length ? (
          <XrplErrorState error={tx.error} server={tx.server} onRetry={tx.reload} />
        ) : (
          <DataTable
            rows={tx.loading && !tx.envs.length ? undefined : shown}
            loading={tx.loading && !tx.envs.length}
            columns={columns}
            rowKey={(r) => r.hash}
            pageSize={25}
            csvName={`xrpl-${address}-activity`}
            empty={{ title: filter === "all" ? "No transactions found" : "No matching transactions in the fetched window", description: tx.hasMore ? "Load older transactions to search further back." : undefined }}
          />
        )}
      </CardBody>
      <CardFooter>
        <span>{tx.error && tx.envs.length ? <span className="text-warning">Loading more failed: {tx.error.message}</span> : "Filters apply to fetched transactions only."}</span>
        {tx.hasMore && (
          <Button variant="secondary" size="xs" loading={tx.loading} onClick={tx.loadMore}>
            Load older
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
