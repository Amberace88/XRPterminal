"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Fish, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMarket } from "@/components/providers/MarketProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { formatCompact, formatCompactMoney, formatMoney, formatTime, formatXrp } from "@/lib/format";
import { useXrplSession } from "@/lib/xrpl/hooks";
import type { LabelIndex } from "@/lib/xrpl/labels";
import { classifyExchangeFlow, DEFAULT_WHALE_THRESHOLD, exchangeFlowTotals, filterWhales, FLOW_DISCLAIMER, WHALE_DISCLAIMER, WHALE_THRESHOLDS, type WhalePayment } from "@/lib/xrpl/whales";
import { AccountRef, SessionBanner, TxLink, XrplConnection, XrplErrorState } from "./shared";
import { useLabels } from "./useLabels";

export function useWhaleThreshold(): [number, (v: number) => void] {
  const [t, setT] = useState<number>(DEFAULT_WHALE_THRESHOLD);
  useEffect(() => {
    const v = readLocal<number>("xrpl:whaleThreshold", DEFAULT_WHALE_THRESHOLD);
    if ((WHALE_THRESHOLDS as readonly number[]).includes(v)) setT(v);
  }, []);
  return [
    t,
    (v: number) => {
      setT(v);
      writeLocal("xrpl:whaleThreshold", v);
    },
  ];
}

export const thresholdLabel = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`);

export function WhaleDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <p className={`flex gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] text-warning ${compact ? "px-2.5 py-1.5 text-2xs" : "px-3 py-2 text-xs"}`} role="note">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {WHALE_DISCLAIMER}
    </p>
  );
}

export function WhaleRow({ w, labels, price, dense }: { w: WhalePayment; labels: LabelIndex; price: number | null; dense?: boolean }) {
  const { tz } = usePreferences();
  const { toDisplay, currency } = useMarket();
  const flow = classifyExchangeFlow(w, labels);
  const usd = price ? w.amountXrp * price : null;
  return (
    <li className="animate-fade-up border-b border-border-subtle/60 px-4 py-2.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="num text-sm font-semibold text-fg">{formatXrp(w.amountXrp, { compact: dense })}</span>
        <span className="flex items-center gap-2">
          {flow && (
            <Tooltip content={`${flow.kind === "inflow" ? "To" : flow.kind === "outflow" ? "From" : "Between"} an account labelled "${flow.exchange}" in XRPScan's well-known names. ${FLOW_DISCLAIMER}`}>
              <Badge tone={flow.kind === "inflow" ? "warning" : flow.kind === "outflow" ? "info" : "neutral"} className="normal-case tracking-normal">
                {flow.kind === "inflow" ? "Exchange inflow" : flow.kind === "outflow" ? "Exchange outflow" : flow.kind === "internal" ? "Same exchange" : "Exchange ↔ exchange"}
              </Badge>
            </Tooltip>
          )}
          {usd !== null && <span className="num text-2xs text-fg-muted">≈ {formatCompactMoney(toDisplay(usd), currency)}</span>}
          <span className="num text-2xs text-fg-muted">{formatTime(w.timeMs ?? w.observedAt, tz, !dense)}</span>
        </span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <AccountRef address={w.from} labels={labels} head={5} tail={4} />
        <ArrowRight className="h-3 w-3 shrink-0 text-fg-muted" />
        <AccountRef address={w.to} labels={labels} head={5} tail={4} />
        {!dense && w.destinationTag !== undefined && <span className="text-2xs text-fg-muted">tag {w.destinationTag}</span>}
        {!dense && (
          <span className="ml-auto">
            <TxLink hash={w.hash} head={6} tail={4} />
          </span>
        )}
      </div>
    </li>
  );
}

export function WhalesView() {
  const s = useXrplSession(["ledger", "transactions"]);
  const [threshold, setThreshold] = useWhaleThreshold();
  const { index: labels, wellKnown } = useLabels();
  const { ticker, toDisplay, currency } = useMarket();
  const price = ticker?.price ?? null;
  const list = useMemo(() => filterWhales(s.whales, threshold), [s.whales, threshold]);
  const totalXrp = list.reduce((a, w) => a + w.amountXrp, 0);
  const largest = list.reduce((a, w) => Math.max(a, w.amountXrp), 0);
  const flows = useMemo(() => exchangeFlowTotals(list, labels), [list, labels]);

  return (
    <div className="space-y-4">
      <WhaleDisclaimer />
      <SessionBanner startedAt={s.txStartedAt} ledgers={s.txLedgers} gaps={s.gaps} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={`Transfers ≥ ${thresholdLabel(threshold)} XRP`} value={list.length} sub="This session" loading={!s.txStartedAt && !s.error} />
        <MetricCard label="Total moved" value={formatXrp(totalXrp, { compact: true })} sub={price ? `≈ ${formatCompactMoney(toDisplay(totalXrp * price), currency)} at current price` : "Price unavailable"} loading={!s.txStartedAt && !s.error} />
        <MetricCard label="Largest" value={largest ? formatXrp(largest, { compact: true }) : "—"} sub="Delivered amount" loading={!s.txStartedAt && !s.error} />
        <MetricCard
          label="Labelled exchange net flow"
          info={`Inflow minus outflow for transfers where one side is labelled as an exchange by XRPScan's well-known names. ${FLOW_DISCLAIMER}`}
          value={flows.inflowCount + flows.outflowCount ? `${flows.netXrp >= 0 ? "+" : ""}${formatCompact(flows.netXrp)} XRP` : "—"}
          sub={`${flows.inflowCount} in · ${flows.outflowCount} out`}
          loading={!s.txStartedAt && !s.error}
        />
      </div>

      <Card>
        <CardHeader
          title="Live whale transfers"
          icon={<Fish className="h-4 w-4" />}
          subtitle="XRP payments by delivered amount (meta.delivered_amount) — newest first"
          actions={
            <Tabs
              value={String(threshold)}
              onChange={(v) => setThreshold(Number(v))}
              size="xs"
              ariaLabel="Threshold"
              items={WHALE_THRESHOLDS.map((t) => ({ value: String(t), label: `≥${thresholdLabel(t)}` }))}
            />
          }
        />
        <CardBody className="px-0 sm:px-0">
          {s.error && !s.txStartedAt ? (
            <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Transaction stream unavailable" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Fish className="h-5 w-5" />}
              title={s.txStartedAt ? `No XRP payments ≥ ${thresholdLabel(threshold)} observed yet` : "Connecting to the transaction stream…"}
              description={
                s.txStartedAt
                  ? `Listening since ${formatTime(s.txStartedAt, undefined, false)}. Transfers this large are occasional — this list only fills with live data and is never backfilled. Keep this page open or try a lower threshold.`
                  : undefined
              }
            />
          ) : (
            <ul aria-live="polite">
              {list.slice(0, 200).map((w) => (
                <WhaleRow key={w.hash} w={w} labels={labels} price={price} />
              ))}
            </ul>
          )}
        </CardBody>
        <CardFooter>
          <XrplConnection state={s.connState} server={s.server} />
          <span>
            Labels: {wellKnown.available ? `XRPScan well-known (${wellKnown.count})` : wellKnown.loading ? "loading…" : "unavailable"} · values at current price
          </span>
        </CardFooter>
      </Card>

      {flows.byExchange.length > 0 && (
        <Card>
          <CardHeader title="Labelled exchange flows (this session)" subtitle={FLOW_DISCLAIMER} />
          <CardBody className="px-0 sm:px-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="label px-4 py-2 text-left font-medium sm:px-5">Exchange (label)</th>
                  <th scope="col" className="label px-3 py-2 text-right font-medium">Inflow</th>
                  <th scope="col" className="label px-3 py-2 text-right font-medium">Outflow</th>
                  <th scope="col" className="label px-4 py-2 text-right font-medium sm:px-5">Net</th>
                </tr>
              </thead>
              <tbody>
                {flows.byExchange.map((e) => (
                  <tr key={e.exchange} className="border-b border-border-subtle/60 last:border-0">
                    <td className="px-4 py-2 text-fg sm:px-5">{e.exchange}</td>
                    <td className="num px-3 py-2 text-right">{formatCompact(e.inflowXrp)}</td>
                    <td className="num px-3 py-2 text-right">{formatCompact(e.outflowXrp)}</td>
                    <td className="num px-4 py-2 text-right sm:px-5">{formatCompact(e.inflowXrp - e.outflowXrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
          <CardFooter>
            <span>Only transfers where a side carries an external exchange label are counted. Unlabelled wallets are never assumed to be exchanges.</span>
          </CardFooter>
        </Card>
      )}
      <p className="text-2xs text-fg-muted">Values in {currency} use the current XRP price ({price ? formatMoney(toDisplay(price), currency, 4) : "unavailable"}), not the price at transfer time.</p>
    </div>
  );
}
