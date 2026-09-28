"use client";

import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { BarChart, LineChart } from "@/components/charts/Charts";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState, NotConnected } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { formatCompact, formatNumber, formatTime } from "@/lib/format";
import { sumActivity, typeBuckets, type LedgerStat } from "@/lib/xrpl/activity";
import { useXrplSession } from "@/lib/xrpl/hooks";
import { RlusdPanel } from "./RlusdPanel";
import { SessionBanner, XrplConnection, XrplErrorState } from "./shared";

type Win = "session" | "24h" | "7D" | "30D" | "90D" | "1Y";

interface Bucket {
  t: number;
  tx: number;
  ledgers: number;
  feesXrp: number;
  payments: number;
  volume: number;
  newAccounts: number;
  offers: number;
  fills: number;
}

/** Aggregate per-ledger stats into time buckets (per ledger for short sessions, per minute otherwise). */
function bucketize(stats: LedgerStat[]): { rows: Bucket[]; unit: "ledger" | "minute" } {
  const closed = stats.filter((s) => s.closeTimeMs !== null);
  const perMinute = closed.length > 90;
  const m = new Map<number, Bucket>();
  for (const s of closed) {
    const key = perMinute ? Math.floor(s.closeTimeMs! / 60_000) * 60_000 : s.ledgerIndex;
    const b = m.get(key) ?? { t: key, tx: 0, ledgers: 0, feesXrp: 0, payments: 0, volume: 0, newAccounts: 0, offers: 0, fills: 0 };
    b.tx += s.txnCount ?? s.observedTx;
    b.ledgers++;
    b.feesXrp += s.feesDrops / 1e6;
    b.payments += s.xrpPayments;
    b.volume += s.xrpPaymentVolume;
    b.newAccounts += s.newAccounts;
    b.offers += s.offerCreates;
    b.fills += s.dexFills;
    m.set(key, b);
  }
  return { rows: [...m.values()].sort((a, b) => a.t - b.t).slice(-180), unit: perMinute ? "minute" : "ledger" };
}

export function ActivityView() {
  const s = useXrplSession(["ledger", "transactions"]);
  const [win, setWin] = useState<Win>("session");
  // A ledger is "complete" when its ledgerClosed header was seen AND every one of its transactions was
  // received from the stream (the first ledger after subscribing is usually partial and is excluded).
  const complete = useMemo(() => s.stats.filter((x) => x.txnCount !== null && x.observedTx >= x.txnCount), [s.stats]);
  const t = useMemo(() => sumActivity(complete), [complete]);
  const types = useMemo(() => typeBuckets(t.types), [t.types]);
  const { rows, unit } = useMemo(() => bucketize(complete), [complete]);
  const maxType = types[0]?.count ?? 1;
  const loading = !s.txStartedAt && !s.error;
  const avgPerLedger = t.ledgers ? t.tx / t.ledgers : null;
  const xFmt = (v: string | number) => (unit === "minute" ? formatTime(Number(v), undefined, false) : `#${String(v).slice(-4)}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={win}
          onChange={setWin}
          size="sm"
          ariaLabel="Time window"
          items={[
            { value: "session", label: "Live session" },
            { value: "24h", label: "24h" },
            { value: "7D", label: "7D" },
            { value: "30D", label: "30D" },
            { value: "90D", label: "90D" },
            { value: "1Y", label: "1Y" },
          ]}
        />
        <XrplConnection state={s.connState} server={s.server} />
      </div>

      {win !== "session" ? (
        <Card>
          <NotConnected
            what={`${win} network charts require an XRPL history indexer (planned). We do not estimate or backfill historical activity.`}
            how="Until the indexer is live, the Live session view aggregates every validated ledger observed since you opened this page."
          />
        </Card>
      ) : (
        <>
          <SessionBanner startedAt={s.txStartedAt} ledgers={s.txLedgers} gaps={s.gaps} />
          {s.error && !s.txStartedAt ? (
            <Card>
              <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Transaction stream unavailable" />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Transactions" loading={loading} value={formatNumber(t.tx, 0)} sub={`${t.ledgers} complete ledgers`} />
                <MetricCard label="Throughput" loading={loading} value={t.txPerSecond ? `${t.txPerSecond.toFixed(1)} tx/s` : "—"} sub={avgPerLedger ? `${avgPerLedger.toFixed(1)} tx / ledger` : "needs ≥2 ledgers"} />
                <MetricCard label="Fees burned" loading={loading} value={`${formatNumber(t.feesXrp, 4)} XRP`} info="XRP transaction fees are destroyed, not paid to anyone." sub={t.tx ? `${t.failed} failed (${((t.failed / t.tx) * 100).toFixed(1)}%)` : undefined} />
                <MetricCard label="New accounts" loading={loading} value={formatNumber(t.newAccounts, 0)} info="Counted from AccountRoot objects created in transaction metadata — the only reliable on-ledger signal of a new account." sub={`${formatNumber(t.activeAccounts, 0)} active senders`} />
                <MetricCard label="XRP payment volume" loading={loading} value={`${formatCompact(t.xrpPaymentVolume)} XRP`} sub={`${formatNumber(t.xrpPayments, 0)} XRP payments · delivered amounts`} />
                <MetricCard label="Token payments" loading={loading} value={formatNumber(t.tokenPayments, 0)} sub={`${formatNumber(t.trustSets, 0)} trust line changes`} />
                <MetricCard label="DEX offers" loading={loading} value={formatNumber(t.offerCreates, 0)} sub={`${formatNumber(t.offerCancels, 0)} cancelled · ${formatNumber(t.dexFills, 0)} offers consumed`} info="Offers consumed = existing DEX offers (partially) filled by other transactions, from metadata." />
                <MetricCard label="AMM / NFT" loading={loading} value={`${formatNumber(t.ammTx, 0)} / ${formatNumber(t.nftTx, 0)}`} sub="Successful AMM* / NFToken* txs" />
              </div>

              <div className="grid gap-4 lg:grid-cols-12">
                <Card className="lg:col-span-8">
                  <CardHeader title="Transactions over the session" icon={<Activity className="h-4 w-4" />} subtitle={`Per ${unit} · live session window (not a 24h chart)`} />
                  <CardBody>
                    {rows.length < 2 ? (
                      <EmptyState title="Collecting ledgers…" description="The chart appears after a few validated ledgers close (≈ every 3–5 seconds)." className="py-8" />
                    ) : (
                      <BarChart data={rows as unknown as Record<string, number>[]} x="t" series={[{ key: "tx", label: "Transactions" }]} height={240} xFormat={xFmt} />
                    )}
                  </CardBody>
                </Card>
                <Card className="lg:col-span-4">
                  <CardHeader title="Transaction types" subtitle="Share of observed transactions" />
                  <CardBody>
                    {types.length === 0 ? (
                      <p className="py-6 text-center text-xs text-fg-muted">No transactions observed yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {types.slice(0, 14).map((b) => (
                          <li key={b.type}>
                            <div className="flex justify-between text-2xs">
                              <span className="text-fg-secondary">{b.type}</span>
                              <span className="num text-fg">
                                {formatNumber(b.count, 0)} <span className="text-fg-muted">({((b.count / t.tx) * 100).toFixed(1)}%)</span>
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 rounded-full bg-surface-hover">
                              <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${Math.max(2, (b.count / maxType) * 100)}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>

              {rows.length >= 2 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="XRP payment volume" subtitle={`Delivered XRP per ${unit}`} />
                    <CardBody>
                      <LineChart data={rows as unknown as Record<string, number>[]} x="t" area series={[{ key: "volume", label: "XRP" }]} height={200} xFormat={xFmt} yFormat={(v) => formatCompact(v)} legend={false} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title="DEX & accounts" subtitle={`Offers created, offers consumed and new accounts per ${unit}`} />
                    <CardBody>
                      <LineChart
                        data={rows as unknown as Record<string, number>[]}
                        x="t"
                        series={[
                          { key: "offers", label: "Offers created" },
                          { key: "fills", label: "Offers consumed" },
                          { key: "newAccounts", label: "New accounts" },
                        ]}
                        height={200}
                        xFormat={xFmt}
                      />
                    </CardBody>
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}

      <RlusdPanel sessionPayments={t.rlusdPayments} sessionVolume={t.rlusdVolume} sessionActive={!!s.txStartedAt} />

      <Card>
        <CardFooter>
          <span>Source: XRPL transactions + ledger streams. Aggregates cover only ledgers fully observed in this browser session.</span>
        </CardFooter>
      </Card>
    </div>
  );
}
