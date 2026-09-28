"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, Waypoints } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { CopyButton } from "@/components/ui/Misc";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useMarket } from "@/components/providers/MarketProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { formatDate, formatDays, formatMoney, formatNumber, formatXrp } from "@/lib/format";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { dropsToXrpString } from "@/lib/xrpl/amount";
import { useServerInfo } from "@/lib/xrpl/hooks";
import { domainLabel, indexLabels } from "@/lib/xrpl/labels";
import { classifyWallet } from "@/lib/xrpl/profiler";
import { walletRiskSignals } from "@/lib/xrpl/risk";
import { decodeAccountFlags, decodeDomain } from "@/lib/xrpl/tx";
import { AccountRef, InlineNote, LabelBadge, XrplErrorState } from "../shared";
import { ShareButton } from "../ShareButton";
import { useLabels } from "../useLabels";
import { AccountActivity } from "./AccountActivity";
import { AccountAnalytics } from "./AccountAnalytics";
import { OpenOffers, TokenBalances } from "./AccountHoldings";
import { AccountSettingsCard, ProfileCard, RiskCard } from "./AccountProfile";
import { LabelEditor, WatchButton } from "./AccountActions";
import { sentTxEstimate, useAccountInfo, useAccountLines, useAccountOffers, useAccountTx, useFirstTx } from "./useAccountData";

type Tab = "activity" | "holdings" | "analytics" | "profile";

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function AccountView({ address, tag }: { address: string; tag?: number | null }) {
  const raw = safeDecode(address).trim();
  const n = normalizeXrplAddress(raw);
  if (!n.ok)
    return (
      <Card>
        <EmptyState title="Not a valid XRPL address" description={`${n.reason}. Classic addresses start with "r"; X-addresses start with "X".`} />
      </Card>
    );
  const t = typeof n.tag === "number" ? n.tag : tag ?? null;
  return <AccountInner key={n.classic} address={n.classic} tag={t} fromX={n.classic !== raw} />;
}

function AccountInner({ address, tag, fromX }: { address: string; tag: number | null; fromX: boolean }) {
  const { tz } = usePreferences();
  const { ticker, toDisplay, currency } = useMarket();
  const info = useAccountInfo(address);
  const exists = !!info.data;
  const lines = useAccountLines(address, exists);
  const offers = useAccountOffers(address, exists);
  const first = useFirstTx(address, exists);
  const tx = useAccountTx(exists ? address : null);
  const srv = useServerInfo(60_000);
  const lab = useLabels();
  const [tab, setTab] = useState<Tab>("activity");

  const data = info.data?.account_data;
  const domain = decodeDomain(data?.Domain);
  const labels = useMemo(() => (domain ? indexLabels([...lab.index.values()].flat(), [domainLabel(address, domain)]) : lab.index), [lab.index, domain, address]);
  const myLabels = labels.get(address) ?? [];
  const userL = myLabels.find((l) => l.source === "user") ?? null;

  const balanceXrp = data ? Number(dropsToXrpString(data.Balance)) : 0;
  const vl = srv.data?.info.validated_ledger;
  const reserve = data && vl?.reserve_base_xrp !== undefined && vl.reserve_inc_xrp !== undefined ? vl.reserve_base_xrp + data.OwnerCount * vl.reserve_inc_xrp : null;
  const valueDisplay = ticker ? toDisplay(balanceXrp * ticker.price) : null;
  const sent = data ? sentTxEstimate(data.Sequence, first.data) : null;
  const complete = !tx.hasMore && !tx.loading && !tx.error;
  const windowText = complete ? `full history (${tx.envs.length} transactions)` : `last ${tx.envs.length} transactions`;

  const profile = useMemo(
    () =>
      data
        ? classifyWallet({
            address,
            balanceXrp,
            txs: tx.envs,
            completeHistory: complete,
            lines: lines.data?.lines ?? [],
            accountFlags: decodeAccountFlags(data.Flags),
            hasAmmId: !!data.AMMID,
            createdAtMs: first.data?.createdAtMs ?? null,
            externalLabels: myLabels.filter((l) => l.source === "xrpscan-well-known"),
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, tx.envs, complete, lines.data, first.data, myLabels.length],
  );
  const risks = useMemo(() => (data ? walletRiskSignals({ address, txs: tx.envs, balanceXrp, labels }) : []), [data, tx.envs, address, balanceXrp, labels]);
  const signerCount = useMemo(() => {
    const sl = (info.data as unknown as { account_data?: { signer_lists?: { SignerEntries?: unknown[] }[] }; signer_lists?: { SignerEntries?: unknown[] }[] }) ?? {};
    const list = sl.signer_lists ?? sl.account_data?.signer_lists;
    return list?.[0]?.SignerEntries?.length ?? null;
  }, [info.data]);

  if (info.error) {
    if (info.error.code === "actNotFound")
      return (
        <Card>
          <EmptyState
            title="Account not found"
            description={`${address} does not exist on the validated ledger. It has never been funded with the base reserve, or it was deleted. Server: ${info.server ?? "unknown"}.`}
          />
        </Card>
      );
    return (
      <Card>
        <XrplErrorState error={info.error} server={info.server} onRetry={info.reload} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <Card>
        <CardBody className="pt-4 sm:pt-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="label mb-1">XRPL account</p>
              <div className="flex min-w-0 items-center gap-1">
                <h2 className="truncate font-mono text-sm text-fg sm:text-base">{address}</h2>
                <CopyButton value={address} label="Copy address" />
              </div>
              {(tag !== null || fromX) && (
                <p className="mt-1 text-2xs text-fg-muted">
                  Normalised from an X-address{tag !== null ? ` — destination tag ${tag}` : ""}. Balances belong to the classic address; tags only route deposits.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {myLabels.map((l) => (
                  <LabelBadge key={l.source + l.name} label={l} />
                ))}
                {!myLabels.length && !lab.wellKnown.loading && <span className="text-2xs text-fg-muted">No public label{lab.wellKnown.available ? "" : " (label source unavailable)"}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <WatchButton address={address} label={userL?.name ?? myLabels[0]?.name} />
              <LabelEditor address={address} existing={userL} storage={lab.storage} onSave={(nm, c) => lab.saveUserLabel(address, nm, c)} onRemove={() => lab.removeUserLabel(address)} />
              <ShareButton title={`XRPL account ${address}`} />
              <ButtonLink href={`/xrpl/graph?seed=${address}`} variant="ghost" size="sm">
                <Waypoints className="h-3.5 w-3.5" /> Graph
              </ButtonLink>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="XRP balance"
          loading={!data}
          value={formatXrp(balanceXrp)}
          sub={valueDisplay !== null ? `≈ ${formatMoney(valueDisplay, currency)} at current price` : "Price unavailable"}
          footer={<DataFreshness timestamp={info.updatedAt} kind="minute" />}
        />
        <MetricCard
          label="Reserved"
          loading={!data}
          info="Base reserve + owner reserve × objects owned (trust lines, offers, …). Reserved XRP cannot be sent."
          value={reserve !== null ? formatXrp(reserve) : "—"}
          sub={data ? `${data.OwnerCount} owned objects · available ${reserve !== null ? formatXrp(Math.max(0, balanceXrp - reserve)) : "—"}` : undefined}
        />
        <MetricCard
          label="Account age"
          loading={!data || (first.loading && !first.data && !first.error)}
          value={first.data?.createdAtMs ? formatDays((Date.now() - first.data.createdAtMs) / 86_400_000) : "—"}
          sub={
            first.error ? (
              "Unavailable from this server (requires full history)"
            ) : first.data?.createdAtMs ? (
              <span>
                Created {formatDate(first.data.createdAtMs, tz)}
                {first.data.activatedBy && (
                  <>
                    {" "}by <AccountRef address={first.data.activatedBy} labels={labels} head={4} tail={4} />
                  </>
                )}
              </span>
            ) : first.data?.env ? (
              `Earliest tx on this server: ${formatDate(first.data.env.closeTimeMs, tz)} (history from ledger ${first.data.historyFrom ?? "?"}) — may be older`
            ) : (
              "No transactions found"
            )
          }
        />
        <MetricCard
          label="Sent transactions"
          loading={!data}
          info={sent?.note}
          value={sent?.value !== null && sent?.value !== undefined ? `≈ ${formatNumber(sent.value, 0)}` : data ? `Seq ${formatNumber(data.Sequence, 0)}` : "—"}
          sub="Sequence-based estimate"
        />
      </div>

      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <ProfileCard className="lg:col-span-7" labels={profile} windowText={windowText} />
            <RiskCard className="lg:col-span-5" signals={risks} />
          </div>

          <div className="-mx-1 overflow-x-auto px-1 py-1">
            <Tabs
              value={tab}
              onChange={setTab}
              size="sm"
              ariaLabel="Account sections"
              items={[
                { value: "activity", label: "Activity" },
                { value: "holdings", label: `Tokens & offers${lines.data ? ` (${lines.data.lines.length})` : ""}` },
                { value: "analytics", label: "Analytics" },
                { value: "profile", label: "Settings" },
              ]}
            />
          </div>

          {tab === "activity" && <AccountActivity address={address} tx={tx} labels={labels} />}
          {tab === "holdings" && (
            <div className="space-y-4">
              <TokenBalances lines={lines.data?.lines} truncated={!!lines.data?.truncated} loading={lines.loading} error={lines.error} server={lines.server} onRetry={lines.reload} labels={labels} />
              <OpenOffers offers={offers.data?.offers} loading={offers.loading} error={offers.error} server={offers.server} onRetry={offers.reload} />
            </div>
          )}
          {tab === "analytics" && (
            <>
              {!complete && (
                <InlineNote tone="info" className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                  Analytics use the {tx.envs.length} most recent transactions fetched so far. Load older transactions in the Activity tab to widen the window.
                </InlineNote>
              )}
              <AccountAnalytics address={address} envs={tx.envs} balanceXrp={balanceXrp} lines={lines.data?.lines ?? []} labels={labels} complete={complete} />
            </>
          )}
          {tab === "profile" && <AccountSettingsCard data={data} domain={domain} signerCount={signerCount} />}
        </>
      )}

      <p className="text-2xs text-fg-muted">
        Source: XRP Ledger via {info.server ?? "public XRPL servers"} · validated ledger {info.data?.ledger_index ? `#${info.data.ledger_index.toLocaleString("en-US")}` : ""}. Public blockchain data only.{" "}
        <Link href="/xrpl" className="text-accent hover:underline">
          Explorer home
        </Link>
      </p>
    </div>
  );
}
