"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, EyeOff, Lock, PieChart, Plus, RefreshCw, Star, Trash2, Wallet } from "lucide-react";
import { LineChart } from "@/components/charts/Charts";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { Hash, PageHeader, Disclaimer } from "@/components/ui/Misc";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMarket } from "@/components/providers/MarketProvider";
import { useDailyHistory } from "@/hooks/useMarketData";
import { useT } from "@/hooks/useT";
import { planOf } from "@/lib/entitlements";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPct, formatSignedMoney, formatXrp } from "@/lib/format";
import { periodChangeAtCurrentHoldings, valueSeriesAtCurrentHoldings, type AccountHolding } from "@/lib/portfolio/holdings";
import { ACCOUNT_TYPE_INFO, type ConnectedAccount } from "@/lib/portfolio/types";
import { serverName } from "@/lib/xrpl/hooks";
import { cn } from "@/lib/utils/cn";
import { ConnectAccountModal } from "./ConnectAccountModal";
import { CostBasisPanel } from "./CostBasisPanel";
import { StressTestPanel } from "./StressTestPanel";
import { useAggregate, useConnectedAccounts, useHoldings, useLots } from "./usePortfolio";

export function PortfolioView() {
  const t = useT();
  const toast = useToast();
  const { plan, isGuest, enabled } = useAuth();
  const acc = useConnectedAccounts();
  const hold = useHoldings(acc.accounts);
  const agg = useAggregate(hold.holdings);
  const lots = useLots();
  const { ticker, toDisplay, currency, status } = useMarket();
  const hist = useDailyHistory("XRP-USD");
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<"90" | "365">("90");

  const price = ticker?.price ?? null;
  const valueUsd = price !== null ? agg.xrp * price : null;
  const candles = hist.data?.candles;
  const changes = useMemo(
    () => (candles && price ? ([1, 7, 30] as const).map((d) => ({ d, c: periodChangeAtCurrentHoldings(candles, agg.xrp, price, d) })) : null),
    [candles, price, agg.xrp],
  );
  const series = useMemo(() => (candles ? valueSeriesAtCurrentHoldings(candles, agg.xrp, Number(range)).map((p) => ({ t: p.t, value: toDisplay(p.value) })) : []), [candles, agg.xrp, range, toDisplay]);
  const limit = planOf(plan).limits.connectedAccounts;
  const accounts = acc.accounts;
  const hasAccounts = !!accounts?.length;
  const loadingSummary = accounts === null || (hold.loading && !hold.updatedAt);

  return (
    <>
      <PageHeader
        title="Portfolio"
        badge={
          <Badge tone="neutral">
            <EyeOff className="h-3 w-3" /> Private
          </Badge>
        }
        description="Read-only view of your XRP across public XRPL wallets and read-only exchange keys. Values use live market data; nothing is estimated or invented."
        actions={
          <>
            {hasAccounts && (
              <Button variant="secondary" size="sm" onClick={hold.reload} loading={hold.loading}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Connect account
            </Button>
          </>
        }
      />
      {acc.storage === "local" && (
        <p className="mb-4 rounded-lg border border-border-subtle bg-surface-hover/40 px-3 py-2 text-2xs text-fg-muted">
          {t("common.guestMode")}.{enabled && isGuest ? " Sign in to keep your portfolio across devices." : ""}
        </p>
      )}
      {acc.error && <p className="mb-4 text-xs text-danger">Could not load connected accounts: {acc.error}</p>}

      {accounts === null ? (
        <SkeletonRows rows={6} />
      ) : !hasAccounts ? (
        <Card>
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title="No wallet connected yet"
            description="Add a public XRPL address to see live balances, tokens, value in your currency, cost basis and a historical stress test. No keys, no signing — read-only."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Connect a wallet
              </Button>
            }
          />
          <CardFooter>
            <span>
              Plan: {planOf(plan).name} · {Number.isFinite(limit) ? `${limit} connected account${limit === 1 ? "" : "s"}` : "unlimited accounts"}
            </span>
            <Link href="/pricing" className="text-accent hover:underline">
              Plans
            </Link>
          </CardFooter>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              label="Total value"
              size="lg"
              className="col-span-2 lg:col-span-1"
              loading={loadingSummary}
              value={valueUsd !== null ? formatMoney(toDisplay(valueUsd), currency) : "—"}
              sub={agg.tokens.length ? `XRP only · ${agg.tokens.length} token balance(s) not valued` : "XRP holdings × live price"}
              footer={<DataFreshness status={status} timestamp={ticker?.provenance.timestamp} provenance={ticker?.provenance} />}
            />
            <MetricCard label="XRP amount" loading={loadingSummary} value={formatXrp(agg.xrp)} sub={`${agg.accountsOk} account${agg.accountsOk === 1 ? "" : "s"}${agg.accountsFailed ? ` · ${agg.accountsFailed} unavailable` : ""}`} />
            {(changes ?? [{ d: 1, c: null }, { d: 7, c: null }, { d: 30, c: null }]).map(({ d, c }) => (
              <MetricCard
                key={d}
                label={`${d === 1 ? "Daily" : d === 7 ? "Weekly" : "Monthly"} change`}
                info="At current holdings: today's XRP amount × (current price − daily close then). It is not your realised history if your holdings changed."
                loading={loadingSummary || (!changes && !hist.error)}
                value={c ? formatSignedMoney(toDisplay(c.changeValue), currency) : "—"}
                delta={c ? formatPct(c.changePct) : undefined}
                deltaTone={toneOf(c?.changePct)}
                sub="at current holdings"
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-8">
              <CardHeader
                title="Portfolio value"
                subtitle="At current XRP holdings × daily XRP/USD close (hypothetical history)"
                actions={<Tabs value={range} onChange={setRange} size="xs" items={[{ value: "90", label: "90D" }, { value: "365", label: "1Y" }]} />}
              />
              <CardBody>
                {hist.error && !candles ? (
                  <p className="py-10 text-center text-xs text-fg-muted">Price history unavailable.</p>
                ) : series.length < 2 ? (
                  <SkeletonRows rows={5} />
                ) : (
                  <LineChart data={series} x="t" area series={[{ key: "value", label: `Value (${currency})` }]} height={240} xFormat={(v) => formatDate(Number(v))} yFormat={(v) => formatMoney(v, currency, 0)} legend={false} />
                )}
              </CardBody>
              <CardFooter>
                <DataFreshness provenance={hist.data?.provenance} kind="daily" />
                <span>Does not reflect past deposits/withdrawals</span>
              </CardFooter>
            </Card>
            <Allocation className="lg:col-span-4" holdings={hold.holdings} price={price} />
          </div>

          <AccountsCard accounts={accounts} holdings={hold.holdings} loading={hold.loading} server={hold.server} updatedAt={hold.updatedAt} onReload={hold.reload} update={acc.update} remove={async (id) => {
            try {
              await acc.remove(id);
              toast({ title: "Account removed", tone: "info" });
            } catch (e) {
              toast({ title: "Could not remove", description: (e as Error).message, tone: "warning" });
            }
          }} />

          <div className="grid gap-4 lg:grid-cols-12">
            <CostBasisPanel className="lg:col-span-8" lots={lots.lots} save={lots.save} remove={lots.remove} holdingsXrp={hold.updatedAt ? agg.xrp : null} storage={lots.storage} />
            <StressTestPanel className="lg:col-span-4" xrp={agg.xrp} />
          </div>
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 text-2xs text-fg-muted">
        <Lock className="h-3 w-3" /> Your portfolio is private by default and never shared. Public sharing, when available, will always require your explicit opt-in.
      </p>
      <Disclaimer short className="mt-3" />

      <ConnectAccountModal open={open} onClose={() => setOpen(false)} accounts={accounts ?? []} addWallet={acc.addWallet} onExchangeConnected={acc.notifyChanged} />
    </>
  );
}

function Allocation({ holdings, price, className }: { holdings: AccountHolding[]; price: number | null; className?: string }) {
  const { toDisplay, currency } = useMarket();
  const ok = holdings.filter((h) => !h.error);
  const total = ok.reduce((s, h) => s + h.xrp, 0);
  const tokens = ok.flatMap((h) => h.tokens);
  const palette = ["bg-accent", "bg-info", "bg-warning", "bg-success", "bg-danger", "bg-fg-muted"];
  return (
    <Card className={className}>
      <CardHeader title="Allocation" icon={<PieChart className="h-4 w-4" />} subtitle="Valued assets by account" />
      <CardBody className="space-y-4">
        {total <= 0 ? (
          <p className="text-xs text-fg-muted">No valued holdings yet.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-hover" role="img" aria-label="Allocation by account">
              {ok.map((h, i) => (h.xrp > 0 ? <div key={h.accountId} className={palette[i % palette.length]} style={{ width: `${(h.xrp / total) * 100}%` }} title={`${h.label}: ${((h.xrp / total) * 100).toFixed(1)}%`} /> : null))}
            </div>
            <ul className="space-y-1.5">
              {ok.map((h, i) => (
                <li key={h.accountId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", palette[i % palette.length])} />
                    <span className="truncate text-fg-secondary">{h.label}</span>
                  </span>
                  <span className="num text-fg">
                    {((h.xrp / total) * 100).toFixed(1)}%{price ? <span className="ml-1 text-2xs text-fg-muted">{formatMoney(toDisplay(h.xrp * price), currency, 0)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div>
          <p className="label mb-1.5">By asset</p>
          <ul className="divide-y divide-border-subtle/60 text-xs">
            <li className="flex justify-between py-1.5">
              <span className="text-fg">XRP</span>
              <span className="num">{formatXrp(total)}</span>
            </li>
            {tokens.slice(0, 8).map((tk) => (
              <li key={tk.key + tk.source} className="flex justify-between gap-2 py-1.5">
                <span className="truncate text-fg-secondary">
                  {tk.currency} <span className="text-2xs text-fg-muted">· {tk.source}</span>
                </span>
                <span className="num text-right">
                  {formatNumber(tk.amount, 4)} <span className="text-2xs text-fg-muted">not valued</span>
                </span>
              </li>
            ))}
          </ul>
          {tokens.length > 0 && <p className="mt-1 text-2xs text-fg-muted">Tokens are shown but not valued: no reliable price source is connected for them.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

function AccountsCard({
  accounts,
  holdings,
  loading,
  server,
  updatedAt,
  onReload,
  update,
  remove,
}: {
  accounts: ConnectedAccount[];
  holdings: AccountHolding[];
  loading: boolean;
  server: string | null;
  updatedAt: number | null;
  onReload: () => void;
  update: (id: string, patch: { label?: string; isPrimary?: boolean }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  const { plan } = useAuth();
  const limit = planOf(plan).limits.connectedAccounts;
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader
        title="Connected accounts"
        icon={<Wallet className="h-4 w-4" />}
        subtitle={`${accounts.length} of ${Number.isFinite(limit) ? limit : "unlimited"} on ${planOf(plan).name}`}
        actions={
          <Link href="/pricing" className="text-2xs text-accent hover:underline">
            Limits
          </Link>
        }
      />
      <CardBody className="px-0 sm:px-0">
        <ul>
          {accounts.map((a) => {
            const h = holdings.find((x) => x.accountId === a.id);
            return (
              <li key={a.id} className="flex flex-col gap-2 border-b border-border-subtle/60 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.type === "EXCHANGE_ACCOUNT" ? <Building2 className="h-4 w-4 text-fg-muted" /> : <Wallet className="h-4 w-4 text-fg-muted" />}
                    <span className="truncate text-sm font-medium text-fg">{a.label || (a.type === "XRPL_WALLET" ? "XRPL wallet" : "Exchange")}</span>
                    <Badge tone="neutral">{ACCOUNT_TYPE_INFO[a.type].name}</Badge>
                    {a.type === "EXCHANGE_ACCOUNT" && <TrustBadge kind="BETA" />}
                    {a.isPrimary && (
                      <Badge tone="accent">
                        <Star className="h-3 w-3" /> Primary
                      </Badge>
                    )}
                    {a.status !== "active" && <Badge tone={a.status === "rejected" ? "danger" : "warning"}>{a.status}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-fg-muted">
                    {a.address ? <Hash value={a.address} href={`/xrpl/account/${a.address}`} /> : a.keyFingerprint ? <span className="font-mono">key {a.keyFingerprint}</span> : null}
                    {a.tag !== null && a.tag !== undefined && <span>tag {a.tag}</span>}
                    {a.type === "EXCHANGE_ACCOUNT" && <span>read-only · last sync {a.lastSyncedAt ? formatDateTime(a.lastSyncedAt) : "never"}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="text-right">
                    {h?.error ? (
                      <button onClick={onReload} className="text-2xs text-warning hover:underline" title={h.error}>
                        Unavailable — retry
                      </button>
                    ) : h ? (
                      <>
                        <p className="num text-sm text-fg">{formatXrp(h.xrp)}</p>
                        <p className="text-2xs text-fg-muted">
                          {h.reserveXrp !== undefined ? `${formatXrp(h.reserveXrp)} reserved · ` : ""}
                          {h.tokens.length} token{h.tokens.length === 1 ? "" : "s"}
                        </p>
                      </>
                    ) : loading ? (
                      <SkeletonRows rows={1} className="w-24" />
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    {!a.isPrimary && (
                      <Button variant="ghost" size="xs" onClick={() => void update(a.id, { isPrimary: true })} aria-label="Make primary" title="Make primary">
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {confirm === a.id ? (
                      <Button variant="danger" size="xs" onClick={() => void remove(a.id).finally(() => setConfirm(null))}>
                        Confirm
                      </Button>
                    ) : (
                      <Button variant="ghost" size="xs" onClick={() => setConfirm(a.id)} aria-label="Remove account" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
      <CardFooter>
        <DataFreshness timestamp={updatedAt} kind="minute" />
        <span>XRPL: {serverName(server)} · validated ledger</span>
      </CardFooter>
    </Card>
  );
}
