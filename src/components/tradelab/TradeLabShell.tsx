"use client";

import { Database, HardDrive } from "lucide-react";
import { SimulatedBanner } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/States";
import { Tooltip } from "@/components/ui/Tooltip";
import { useT } from "@/hooks/useT";
import { MarketDataLabel, PnL, SimTag, TradeLabNav, px, usd } from "./common";
import { TradeLabProvider, useTradeLab } from "./TradeLabProvider";

function Header() {
  const t = useT();
  const { repoKind, accounts, accountId, switchAccount, summary, snapshot, marketStatus, streaming, venue, persistError, error, reload } = useTradeLab();
  return (
    <div className="mb-4 space-y-3">
      <SimulatedBanner />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Trade Lab</h1>
            <SimTag />
            <Badge tone="neutral">Paper · XRP-USD</Badge>
            <Tooltip content={repoKind === "local" ? t("common.guestMode") : "Saved to your account (paper ledger, separate from real portfolio data)."}>
              <span tabIndex={0} className="inline-flex items-center gap-1 text-2xs text-fg-muted">
                {repoKind === "local" ? <HardDrive className="h-3 w-3" /> : <Database className="h-3 w-3" />}
                {repoKind === "local" ? "Guest mode" : "Synced"}
              </span>
            </Tooltip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span>
              XRP <span className="num font-medium text-fg">{px(snapshot?.price ?? null)}</span>
            </span>
            <MarketDataLabel status={marketStatus} streaming={streaming} updatedAt={snapshot?.quoteT ?? null} venue={venue} />
            {summary && (
              <span>
                Equity <span className="num font-medium text-fg">{usd(summary.equity)}</span> · <PnL value={summary.netPnl} pctValue={summary.returnPct} />
              </span>
            )}
          </div>
        </div>
        {accounts.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="tl-account" className="label">
              Account
            </label>
            <select id="tl-account" className="select h-8 w-44 text-xs" value={accountId ?? ""} onChange={(e) => switchAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <TradeLabNav />
      {persistError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">Could not save the latest simulation events: {persistError}. They are kept in this session; reload to retry.</p>}
      {error && <ErrorState compact title="Trade Lab data could not be loaded" message={error} onRetry={reload} />}
    </div>
  );
}

export function TradeLabShell({ children }: { children: React.ReactNode }) {
  return (
    <TradeLabProvider>
      <Header />
      {children}
    </TradeLabProvider>
  );
}
