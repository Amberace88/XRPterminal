"use client";

import { Coins, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatNumber } from "@/lib/format";
import { displayCurrency, formatAmount, isLpTokenCode, parseAmount } from "@/lib/xrpl/amount";
import type { LabelIndex } from "@/lib/xrpl/labels";
import type { AccountOffer, TrustLine } from "@/lib/xrpl/types";
import { AccountRef, XrplErrorState } from "../shared";

export function TokenBalances({
  lines,
  truncated,
  loading,
  error,
  server,
  onRetry,
  labels,
}: {
  lines: TrustLine[] | undefined;
  truncated: boolean;
  loading: boolean;
  error: Error | null;
  server: string | null;
  onRetry: () => void;
  labels: LabelIndex;
}) {
  const cols: Column<TrustLine>[] = [
    {
      key: "cur",
      header: "Token",
      value: (l) => displayCurrency(l.currency),
      cell: (l) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-fg">{displayCurrency(l.currency)}</span>
          {isLpTokenCode(l.currency) && <Badge tone="info">AMM LP</Badge>}
          {Number(l.balance) < 0 && <Badge tone="accent">Issued by this account</Badge>}
        </span>
      ),
    },
    {
      key: "bal",
      header: "Balance",
      align: "right",
      value: (l) => Number(l.balance),
      cell: (l) => <span className={Number(l.balance) < 0 ? "text-fg-muted" : "text-fg"}>{formatNumber(Number(l.balance), 6)}</span>,
    },
    { key: "issuer", header: "Issuer / counterparty", hideBelow: "sm", cell: (l) => <AccountRef address={l.account} labels={labels} /> },
    { key: "limit", header: "Limit", align: "right", hideBelow: "md", value: (l) => Number(l.limit), cell: (l) => <span className="text-fg-muted">{formatNumber(Number(l.limit), 2)}</span> },
    {
      key: "flags",
      header: "Flags",
      hideBelow: "lg",
      cell: (l) => (
        <span className="flex flex-wrap gap-1">
          {l.freeze && <Badge tone="danger">Frozen</Badge>}
          {l.freeze_peer && <Badge tone="danger">Frozen by issuer</Badge>}
          {l.no_ripple && <Badge tone="neutral">No ripple</Badge>}
          {l.authorized && <Badge tone="success">Authorized</Badge>}
        </span>
      ),
    },
  ];
  const holding = lines?.filter((l) => Number(l.balance) > 0).length ?? 0;
  return (
    <Card id="tokens">
      <CardHeader
        title="Token balances & trust lines"
        icon={<Coins className="h-4 w-4" />}
        subtitle={lines ? `${lines.length} trust lines · ${holding} with a positive balance` : "account_lines"}
        info="Trust lines are permissions to hold a token from an issuer. Negative balances mean other accounts hold tokens issued by this account. Token values are not estimated — no reliable price source is connected for XRPL tokens."
      />
      <CardBody className="px-0 sm:px-0">
        {error && !lines ? (
          <XrplErrorState error={error} server={server} onRetry={onRetry} />
        ) : (
          <DataTable
            rows={lines}
            loading={loading}
            columns={cols}
            rowKey={(l, i) => `${l.currency}.${l.account}.${i}`}
            pageSize={15}
            initialSort={{ key: "bal", dir: "desc" }}
            empty={{ title: "No trust lines", description: "This account holds only XRP." }}
          />
        )}
      </CardBody>
      {truncated && (
        <CardFooter>
          <span className="text-warning">Showing the first 2,000 trust lines only.</span>
        </CardFooter>
      )}
    </Card>
  );
}

export function OpenOffers({ offers, loading, error, server, onRetry }: { offers: AccountOffer[] | undefined; loading: boolean; error: Error | null; server: string | null; onRetry: () => void }) {
  const cols: Column<AccountOffer>[] = [
    { key: "seq", header: "Seq", value: (o) => o.seq, cell: (o) => <span className="num text-fg-muted">{o.seq}</span> },
    { key: "gets", header: "Selling (taker gets)", cell: (o) => <span className="text-xs">{formatAmount(parseAmount(o.taker_gets))}</span> },
    { key: "pays", header: "For (taker pays)", cell: (o) => <span className="text-xs">{formatAmount(parseAmount(o.taker_pays))}</span> },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      hideBelow: "sm",
      value: (o) => {
        const g = parseAmount(o.taker_gets);
        const p = parseAmount(o.taker_pays);
        return g && p && g.num ? p.num / g.num : null;
      },
      cell: (o) => {
        const g = parseAmount(o.taker_gets);
        const p = parseAmount(o.taker_pays);
        return g && p && g.num ? (
          <span className="text-2xs text-fg-secondary">
            {formatNumber(p.num / g.num, 6)} {p.currency}/{g.currency}
          </span>
        ) : (
          "—"
        );
      },
    },
  ];
  return (
    <Card id="offers">
      <CardHeader title="Open DEX offers" icon={<ArrowRightLeft className="h-4 w-4" />} subtitle="account_offers · current validated ledger" />
      <CardBody className="px-0 sm:px-0">
        {error && !offers ? (
          <XrplErrorState error={error} server={server} onRetry={onRetry} />
        ) : (
          <DataTable rows={offers} loading={loading} columns={cols} rowKey={(o) => String(o.seq)} pageSize={15} empty={{ title: "No open offers" }} />
        )}
      </CardBody>
    </Card>
  );
}
