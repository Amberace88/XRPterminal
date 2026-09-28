"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Hash } from "@/components/ui/Misc";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatAge, formatMoney, formatXrp } from "@/lib/format";
import { serverName, useXrplQuery } from "@/lib/xrpl/hooks";
import { dropsToXrpString } from "@/lib/xrpl/amount";
import type { AccountInfoResult } from "@/lib/xrpl/types";
import { XrplErrorState } from "@/components/xrpl/shared";
import { fetchLastActivity, useConnectedAccounts } from "@/components/portfolio/usePortfolio";

/** Dashboard widget: primary connected XRPL wallet — balance and last on-ledger activity. */
export function WalletSummaryWidget({ className }: { className?: string }) {
  const acc = useConnectedAccounts();
  const wallets = (acc.accounts ?? []).filter((a) => a.type === "XRPL_WALLET" && a.address);
  const primary = wallets.find((a) => a.isPrimary) ?? wallets[0] ?? null;
  const addr = primary?.address ?? null;
  const q = useXrplQuery(addr ? `wallet-summary:${addr}` : null, async (c) => {
    const info = await c.request<AccountInfoResult>("account_info", { account: addr, ledger_index: "validated" });
    const last = await fetchLastActivity(addr!).catch(() => null);
    return { balance: Number(dropsToXrpString(info.account_data.Balance)), last };
  }, { refreshMs: 60_000 });
  const { ticker, toDisplay, currency } = useMarket();
  return (
    <Card className={className}>
      <CardHeader
        title="Primary wallet"
        icon={<Wallet className="h-4 w-4" />}
        subtitle={primary?.label || "XRPL wallet"}
        actions={
          addr ? (
            <Link href={`/xrpl/account/${addr}`} className="text-2xs font-medium text-accent hover:underline">
              Open →
            </Link>
          ) : undefined
        }
      />
      <CardBody>
        {acc.accounts === null ? (
          <SkeletonRows rows={3} />
        ) : !primary ? (
          <EmptyState
            className="py-5"
            title="No wallet connected yet"
            description="Connect a public XRPL address — read-only."
            action={
              <ButtonLink href="/portfolio" size="sm">
                Connect a wallet
              </ButtonLink>
            }
          />
        ) : q.error ? (
          <XrplErrorState error={q.error} server={q.server} onRetry={q.reload} />
        ) : !q.data ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="space-y-3">
            <Hash value={addr!} href={`/xrpl/account/${addr}`} />
            <div>
              <p className="num text-2xl font-semibold tracking-tight text-fg">{formatXrp(q.data.balance)}</p>
              <p className="num text-xs text-fg-muted">{ticker ? `≈ ${formatMoney(toDisplay(q.data.balance * ticker.price), currency)}` : "Price unavailable"}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-xs">
              <span className="text-fg-muted">Last activity</span>
              {q.data.last?.hash ? (
                <Link href={`/xrpl/tx/${q.data.last.hash}`} className="text-accent-strong hover:underline">
                  {q.data.last.type} · {formatAge(q.data.last.timeMs)}
                </Link>
              ) : (
                <span className="text-fg-muted">unavailable</span>
              )}
            </div>
          </div>
        )}
      </CardBody>
      <CardFooter>
        <span>Validated ledger · {serverName(q.server)}</span>
        {wallets.length > 1 && <span>{wallets.length} wallets</span>}
      </CardFooter>
    </Card>
  );
}
