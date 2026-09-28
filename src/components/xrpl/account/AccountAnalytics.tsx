"use client";

import { useMemo, useState } from "react";
import { BarChart3, LineChart as LineIcon, Users } from "lucide-react";
import { BarChart, LineChart } from "@/components/charts/Charts";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Misc";
import { EmptyState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useMarket } from "@/components/providers/MarketProvider";
import { useDailyHistory } from "@/hooks/useMarketData";
import { formatCompact, formatDate, formatMoney, formatNumber, formatXrp } from "@/lib/format";
import { closeAt } from "@/lib/portfolio/holdings";
import { displayCurrency } from "@/lib/xrpl/amount";
import type { LabelIndex } from "@/lib/xrpl/labels";
import type { TrustLine, TxEnvelope } from "@/lib/xrpl/types";
import { counterparties, paymentSummary, reconstructBalanceHistory, txPerDay } from "@/lib/xrpl/wallet";
import { AccountRef } from "../shared";

export function AccountAnalytics({
  address,
  envs,
  balanceXrp,
  lines,
  labels,
  complete,
}: {
  address: string;
  envs: TxEnvelope[];
  balanceXrp: number;
  lines: TrustLine[];
  labels: LabelIndex;
  complete: boolean;
}) {
  const n = envs.length;
  const windowNote = complete ? `all ${n} transactions` : `within the last ${n} transactions`;
  const sum = useMemo(() => paymentSummary(envs, address), [envs, address]);
  const cps = useMemo(() => counterparties(envs, address), [envs, address]);
  const [cpSort, setCpSort] = useState<"count" | "volume">("count");
  const top = useMemo(() => [...cps].sort((a, b) => (cpSort === "count" ? b.count - a.count : b.volumeXrp - a.volumeXrp)).slice(0, 10), [cps, cpSort]);
  const perDay = useMemo(() => txPerDay(envs), [envs]);

  if (!n)
    return (
      <Card>
        <EmptyState title="No transactions to analyse" description="Analytics are computed from the fetched transaction window." />
      </Card>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardHeader title="Payment summary" subtitle={`XRP payments ${windowNote}`} />
        <CardBody>
          <div className="divide-y divide-border-subtle/60">
            <Stat label="Received" value={`${formatXrp(sum.inXrp)} · ${sum.inCount} payments`} />
            <Stat label="Sent" value={`${formatXrp(sum.outXrp)} · ${sum.outCount} payments`} />
            <Stat label="Net XRP flow" value={<span className={sum.netXrp >= 0 ? "text-success" : "text-danger"}>{sum.netXrp >= 0 ? "+" : ""}{formatXrp(sum.netXrp)}</span>} />
            <Stat label="Largest received" value={formatXrp(sum.largestInXrp)} />
            <Stat label="Largest sent" value={formatXrp(sum.largestOutXrp)} />
            <Stat label="Token payments in / out" value={`${sum.tokenIn} / ${sum.tokenOut}`} />
            <Stat label="Fees paid" value={`${formatNumber(sum.feesPaidXrp, 6)} XRP`} />
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-7">
        <CardHeader
          title="Top counterparties"
          icon={<Users className="h-4 w-4" />}
          subtitle={`Successful payments ${windowNote}`}
          actions={<Tabs value={cpSort} onChange={setCpSort} size="xs" items={[{ value: "count", label: "By count" }, { value: "volume", label: "By XRP volume" }]} />}
        />
        <CardBody className="px-0 sm:px-0">
          {top.length === 0 ? (
            <EmptyState title="No payment counterparties in this window" className="py-6" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th scope="col" className="label px-4 py-2 text-left font-medium sm:px-5">Account</th>
                    <th scope="col" className="label px-3 py-2 text-right font-medium">Payments</th>
                    <th scope="col" className="label px-3 py-2 text-right font-medium">In XRP</th>
                    <th scope="col" className="label px-4 py-2 text-right font-medium sm:px-5">Out XRP</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.address} className="border-b border-border-subtle/60 last:border-0">
                      <td className="px-4 py-2 sm:px-5">
                        <AccountRef address={c.address} labels={labels} />
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {c.count} <span className="text-2xs text-fg-muted">({c.inCount}↓ {c.outCount}↑)</span>
                      </td>
                      <td className="num px-3 py-2 text-right text-success">{c.inXrp ? formatCompact(c.inXrp) : "—"}</td>
                      <td className="num px-4 py-2 text-right text-danger sm:px-5">{c.outXrp ? formatCompact(c.outXrp) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <span>Counterparties are observed payment partners — not relationships or ownership.</span>
        </CardFooter>
      </Card>

      <Card className="lg:col-span-6">
        <CardHeader title="Activity pattern" icon={<BarChart3 className="h-4 w-4" />} subtitle={`Transactions per UTC day, ${windowNote}`} />
        <CardBody>
          {perDay.length < 2 ? (
            <p className="py-6 text-center text-xs text-fg-muted">All fetched activity happened on a single day ({perDay[0]?.day ?? "—"}).</p>
          ) : (
            <BarChart data={perDay} x="day" series={[{ key: "count", label: "Transactions" }]} height={220} xFormat={(v) => String(v).slice(5)} />
          )}
        </CardBody>
      </Card>

      <BalanceHistory className="lg:col-span-6" address={address} envs={envs} balanceXrp={balanceXrp} lines={lines} windowNote={windowNote} />
    </div>
  );
}

function BalanceHistory({ address, envs, balanceXrp, lines, windowNote, className }: { address: string; envs: TxEnvelope[]; balanceXrp: number; lines: TrustLine[]; windowNote: string; className?: string }) {
  const tokens = lines.filter((l) => Number(l.balance) !== 0).slice(0, 30);
  const [asset, setAsset] = useState("XRP");
  const [showValue, setShowValue] = useState(false);
  const hist = useDailyHistory("XRP-USD");
  const { toDisplay, currency } = useMarket();
  const series = useMemo(() => {
    if (asset === "XRP") return reconstructBalanceHistory(envs, address, balanceXrp);
    const l = tokens.find((t) => `${t.currency}.${t.account}` === asset);
    if (!l) return null;
    return reconstructBalanceHistory(envs, address, l.balance, { currencyCode: l.currency, issuer: l.account });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, envs, address, balanceXrp, lines]);
  const candles = hist.data?.candles;
  const rows = useMemo(() => {
    if (!series) return [];
    return series.points.map((p) => {
      const c = asset === "XRP" && candles ? closeAt(candles, p.timeMs) : null;
      return { t: p.timeMs, balance: p.balance, value: c ? toDisplay(p.balance * c.c) : null };
    });
  }, [series, candles, asset, toDisplay]);
  const unit = asset === "XRP" ? "XRP" : displayCurrency(asset.split(".")[0]);
  return (
    <Card className={className}>
      <CardHeader
        title="Balance history"
        icon={<LineIcon className="h-4 w-4" />}
        subtitle={`Reconstructed from ${windowNote}`}
        info="Walks back from the current validated balance using each transaction's metadata balance changes (exact post-transaction XRP balances re-anchor the walk). Only covers the fetched window."
        actions={
          <select className="select h-7 max-w-[9rem] text-2xs" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Asset">
            <option value="XRP">XRP</option>
            {tokens.map((t) => (
              <option key={`${t.currency}.${t.account}`} value={`${t.currency}.${t.account}`}>
                {displayCurrency(t.currency)} ({t.account.slice(0, 5)}…)
              </option>
            ))}
          </select>
        }
      />
      <CardBody>
        {!rows.length ? (
          <p className="py-6 text-center text-xs text-fg-muted">No dated balance changes for this asset in the fetched window.</p>
        ) : (
          <>
            <LineChart
              data={rows}
              x="t"
              area
              height={220}
              series={[showValue && asset === "XRP" ? { key: "value", label: `Est. value (${currency})` } : { key: "balance", label: unit }]}
              xFormat={(v) => formatDate(Number(v))}
              yFormat={(v) => (showValue && asset === "XRP" ? formatMoney(v, currency, 0) : formatCompact(v))}
            />
            {asset === "XRP" && (
              <label className="mt-2 flex items-center gap-2 text-2xs text-fg-muted">
                <input type="checkbox" checked={showValue} onChange={(e) => setShowValue(e.target.checked)} disabled={!candles} />
                Show estimated value (balance × XRP/USD daily close{currency !== "USD" ? `, converted at today's FX rate` : ""})
              </label>
            )}
          </>
        )}
      </CardBody>
      <CardFooter>
        <span>Balance before oldest fetched tx: {series ? `${formatNumber(series.startBalance, 6)} ${unit}` : "—"}</span>
      </CardFooter>
    </Card>
  );
}
