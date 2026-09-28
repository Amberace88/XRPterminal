"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LineChart as LineIcon } from "lucide-react";
import { BarChart, LineChart } from "@/components/charts/Charts";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { ButtonLink } from "@/components/ui/Button";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { listVersions, stateAtVersion, summarize } from "@/lib/tradelab/engine";
import { buyAndHold, drawdownDetail, drawdownSeries, MIN_TRADES_FOR_RISK_ADJUSTED, monthlyPnl, scorecard, tradeQuality, tradeStats } from "@/lib/tradelab/stats";
import type { ClosedTrade } from "@/lib/tradelab/types";
import { KV, PaperNotice, PnL, SimTag, pct, px, qtyFmt, sample, susd, usd } from "./common";
import { useTradeLab } from "./TradeLabProvider";

const exitLabel = (t: ClosedTrade) => (t.exitRoles.includes("STOP_LOSS") ? "Stop-loss" : t.exitRoles.includes("TAKE_PROFIT") ? "Take-profit" : "Manual / exit order");
const pf = (v: number | null) => (v === null ? "—" : Number.isFinite(v) ? v.toFixed(2) : "∞");

export function PerformanceView() {
  const { state, events, accountId, loading, snapshot } = useTradeLab();
  const versions = useMemo(() => listVersions(events), [events]);
  const [version, setVersion] = useState<number | null>(null);
  const v = version ?? state?.version ?? 1;
  const st = useMemo(() => {
    if (!state || !accountId) return null;
    return v === state.version ? state : stateAtVersion(accountId, events, v);
  }, [state, accountId, events, v]);

  if (loading) return <Skeleton className="h-[600px] w-full" />;
  if (!st) {
    return (
      <Card>
        <EmptyState title="No paper account yet" description="Create a simulated account in the terminal to start tracking performance." action={<ButtonLink href="/trade-lab" size="sm">Open terminal</ButtonLink>} icon={<LineIcon className="h-5 w-5" />} />
      </Card>
    );
  }
  const current = v === state?.version;
  const sum = summarize(st, current ? snapshot?.price ?? null : null, Date.now());
  const stats = tradeStats(st.trades, sum.startingCapital, sum.equity);
  const curve = st.equityCurve;
  const dd = drawdownDetail(curve);
  const bench = buyAndHold(curve, sum.startingCapital, st.settings.fees.takerPct);
  const card = scorecard(stats, dd, bench, st.trades);
  const months = monthlyPnl(st.trades);
  const eqRows = sample(bench.points).map((p) => ({ t: p.t, Strategy: p.strategy, "Buy & hold XRP": p.benchmark }));
  const ddRows = sample(drawdownSeries(curve)).map((p) => ({ t: p.t, Drawdown: p.drawdownPct }));
  const df = (x: string | number) => formatDate(Number(x));

  const metrics = [
    { label: "Net P&L", value: <PnL value={sum.netPnl} />, info: "Equity − starting capital (after fees & slippage)." },
    { label: "Total return", value: pct(sum.returnPct), tone: toneOf(sum.returnPct) },
    { label: "Win rate", value: stats.winRate !== null ? pct(stats.winRate, 1, false) : "—", sub: `${stats.wins}W / ${stats.losses}L` },
    { label: "Profit factor", value: pf(stats.profitFactor), info: GLOSSARY.profitFactor },
    { label: "Average win", value: usd(stats.avgWin) },
    { label: "Average loss", value: usd(stats.avgLoss) },
    { label: "Largest win", value: usd(stats.largestWin) },
    { label: "Largest loss", value: usd(stats.largestLoss) },
    { label: "Trades (round trips)", value: String(stats.totalTrades) },
    { label: "Avg holding time", value: formatDuration(stats.avgHoldingMs) },
    { label: "Max drawdown", value: pct(-dd.maxDrawdownPct), info: GLOSSARY.drawdown },
    {
      label: "Avg R / trade",
      value: stats.avgR !== null ? `${stats.avgR.toFixed(2)}R` : "—",
      sub: `${stats.tradesWithR} trade(s) with a stop`,
      info: GLOSSARY.rMultiple,
    },
    {
      label: "Per-trade Sharpe",
      value: stats.perTradeSharpe !== null ? stats.perTradeSharpe.toFixed(2) : "—",
      sub: stats.perTradeSharpe === null ? `Needs ≥ ${MIN_TRADES_FOR_RISK_ADJUSTED} trades` : "mean ÷ stdev of trade returns",
      info: "Risk-adjusted metric shown only when the sample is large enough to be meaningful.",
    },
    { label: "Fees paid", value: usd(sum.feesPaid), sub: `Slippage ${usd(sum.slippageCost)}` },
  ];

  const tradeCols: Column<ClosedTrade>[] = [
    { key: "id", header: "Trade", value: (t) => t.id, cell: (t) => <span className="font-mono text-xs text-fg">{t.id.toUpperCase()}</span> },
    { key: "closed", header: "Closed", value: (t) => t.closedAt, cell: (t) => <span className="text-fg-muted">{formatDateTime(t.closedAt, undefined, false)}</span> },
    { key: "qty", header: "Qty", align: "right", hideBelow: "md", value: (t) => t.qty, cell: (t) => qtyFmt(t.qty) },
    { key: "entry", header: "Entry", align: "right", value: (t) => t.avgEntry, cell: (t) => px(t.avgEntry) },
    { key: "exit", header: "Exit", align: "right", value: (t) => t.avgExit, cell: (t) => px(t.avgExit) },
    { key: "net", header: "Net P&L", align: "right", value: (t) => t.netPnl, cell: (t) => <PnL value={t.netPnl} /> },
    { key: "ret", header: "Return", align: "right", hideBelow: "sm", value: (t) => t.returnPct, cell: (t) => pct(t.returnPct) },
    { key: "r", header: "R", align: "right", value: (t) => t.rMultiple, cell: (t) => (t.rMultiple !== null ? `${t.rMultiple.toFixed(2)}R` : <span className="text-fg-muted">no stop</span>) },
    { key: "why", header: "Exit", hideBelow: "md", value: (t) => exitLabel(t), cell: (t) => <span className="text-2xs text-fg-muted">{exitLabel(t)}</span> },
    { key: "hold", header: "Held", align: "right", hideBelow: "lg", value: (t) => t.holdingMs, cell: (t) => formatDuration(t.holdingMs) },
    { key: "fees", header: "Fees", align: "right", hideBelow: "lg", value: (t) => t.fees, cell: (t) => usd(t.fees, 4) },
    { key: "j", header: "", align: "right", cell: (t) => <Link className="text-2xs text-accent hover:underline" href={`/trade-lab/journal?trade=${t.id}`}>Journal</Link> },
  ];
  const quality = st.trades.map(tradeQuality);
  const qCols: Column<(typeof quality)[number]>[] = [
    { key: "id", header: "Trade", cell: (q) => <span className="font-mono text-xs">{q.id.toUpperCase()}</span> },
    { key: "pe", header: "Planned entry", align: "right", cell: (q) => px(q.plannedEntry) },
    { key: "ae", header: "Actual entry", align: "right", cell: (q) => px(q.actualEntry) },
    { key: "es", header: "Entry slip.", align: "right", value: (q) => q.entrySlippagePct, cell: (q) => pct(q.entrySlippagePct, 3) },
    { key: "pr", header: "Planned risk", align: "right", hideBelow: "sm", cell: (q) => usd(q.plannedRisk) },
    { key: "ar", header: "Actual risk", align: "right", hideBelow: "sm", cell: (q) => (q.hadStop ? usd(q.actualRisk) : <span className="text-warning">undefined</span>) },
    { key: "et", header: "Entry timing", align: "right", hideBelow: "md", value: (q) => q.entryTiming, cell: (q) => (q.entryTiming !== null ? pct(q.entryTiming * 100, 0, false) : "—") },
    { key: "ee", header: "Exit efficiency", align: "right", hideBelow: "md", value: (q) => q.exitEfficiency, cell: (q) => (q.exitEfficiency !== null ? pct(q.exitEfficiency * 100, 0, false) : "—") },
    { key: "r", header: "R", align: "right", value: (q) => q.rMultiple, cell: (q) => (q.rMultiple !== null ? `${q.rMultiple.toFixed(2)}R` : "—") },
    { key: "sc", header: "Slippage + fees", align: "right", hideBelow: "lg", cell: (q) => usd(q.slippageCost + q.fees, 4) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-fg">Performance</h2>
          <SimTag />
          {!current && <Badge tone="warning">Archived version {v}</Badge>}
        </div>
        {versions.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            Account version
            <select className="select h-8 w-40 text-xs" value={v} onChange={(e) => setVersion(Number(e.target.value))}>
              {versions.map((x) => (
                <option key={x.version} value={x.version}>
                  v{x.version} · {formatDate(x.startedAt)}
                  {x.version === state?.version ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {metrics.map((m) => (
          <MetricCard key={m.label} size="sm" className="p-3" label={m.label} value={m.value} sub={m.sub} info={m.info} deltaTone={m.tone} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Equity curve vs buy-and-hold XRP" subtitle="Same starting capital, same period. Benchmark buys XRP at the first recorded price and pays one taker fee." actions={<SimTag />} />
          <CardBody>
            {eqRows.length > 1 ? (
              <LineChart data={eqRows} x="t" series={[{ key: "Strategy", label: "Paper account" }, { key: "Buy & hold XRP", label: "Buy & hold XRP", dashed: true }]} xFormat={df} yFormat={(y) => usd(y, 0)} height={280} />
            ) : (
              <EmptyState title="Not enough history yet" description="The equity curve fills in as the account is marked to market and trades fill." />
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Benchmark comparison" info="Comparison only — no conclusion that one approach is better without context (period, risk, drawdown)." />
          <CardBody className="pt-2">
            <KV label="Paper account return" value={pct(bench.strategyReturnPct)} />
            <KV label="Buy & hold XRP return" value={pct(bench.benchmarkReturnPct)} />
            <KV label="Difference" value={pct(card.differencePct)} />
            <KV label="Benchmark entry price" value={px(bench.entryPrice)} />
            <KV label="Period" value={curve.length ? `${formatDate(curve[0].t)} → ${formatDate(curve[curve.length - 1].t)}` : "—"} />
            <p className="mt-3 text-2xs leading-relaxed text-fg-muted">
              A higher return alone does not make one approach better: compare drawdown, time in market, number of trades and the length of the period. Short periods are dominated by noise.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Drawdown" info={GLOSSARY.drawdown} />
          <CardBody>
            {ddRows.length > 1 ? (
              <LineChart data={ddRows} x="t" series={[{ key: "Drawdown", label: "Drawdown %" }]} area xFormat={df} yFormat={(y) => `${y.toFixed(1)}%`} height={200} />
            ) : (
              <EmptyState title="No drawdown data yet" />
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Max drawdown detail" />
          <CardBody className="pt-2">
            <KV label="Max drawdown" value={`${pct(-dd.maxDrawdownPct)} (${usd(-dd.maxDrawdownAbs)})`} />
            <KV label="Peak" value={dd.peakT ? `${usd(dd.peakEquity)} · ${formatDate(dd.peakT)}` : "—"} />
            <KV label="Trough" value={dd.troughT ? `${usd(dd.troughEquity)} · ${formatDate(dd.troughT)}` : "—"} />
            <KV label="Recovery" value={dd.maxDrawdownPct === 0 ? "—" : dd.recoveryT ? formatDate(dd.recoveryT) : "Not yet recovered"} />
            <KV label="Duration" value={formatDuration(dd.durationMs)} />
            <KV label="Current drawdown" value={pct(-dd.currentDrawdownPct)} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Closed trades" subtitle="Round trips (position opened → closed). R = net result ÷ initial risk to the stop." actions={<SimTag />} />
        <div className="pb-2">
          <DataTable rows={[...st.trades].reverse()} columns={tradeCols} rowKey={(t) => t.id} csvName="trade-lab-trades-simulated" empty={{ title: "No closed trades yet", description: "Open and close a simulated position to see statistics." }} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Trade quality" info="Planned vs actual execution. Entry timing / exit efficiency use sampled prices while the position was open (mark-to-market points), so they are approximate." />
          <div className="pb-2">
            <DataTable rows={[...quality].reverse()} columns={qCols} rowKey={(q) => q.id} empty={{ title: "No trades to assess yet" }} pageSize={10} />
          </div>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Strategy scorecard" info="Side-by-side facts. Deliberately no single composite 'best' score." />
          <CardBody className="pt-2">
            <div className="grid grid-cols-2 gap-x-6">
              <KV label="Return" value={pct(card.strategyReturnPct)} />
              <KV label="Benchmark" value={pct(card.benchmarkReturnPct)} />
              <KV label="Max drawdown" value={pct(-card.maxDrawdownPct)} />
              <KV label="Profit factor" value={pf(card.profitFactor)} />
              <KV label="Win rate" value={card.winRate !== null ? pct(card.winRate, 1, false) : "—"} />
              <KV label="Trades" value={card.tradeCount} />
              <KV label="Consistency" value={card.consistencyPct !== null ? `${pct(card.consistencyPct, 0, false)} of ${card.monthsWithTrades} mo.` : "—"} tip="Share of months with trades that ended net positive." />
              <KV label="Max losing streak" value={stats.maxConsecutiveLosses} />
            </div>
            {months.length > 0 && (
              <div className="mt-3">
                <p className="label mb-1">Monthly net P&L</p>
                <BarChart data={months.map((m) => ({ month: m.month, pnl: m.pnl }))} x="month" series={[{ key: "pnl", label: "Net P&L" }]} signColors height={150} yFormat={(y) => susd(y, 0)} />
              </div>
            )}
          </CardBody>
          <CardFooter>
            <span>SIMULATED results</span>
          </CardFooter>
        </Card>
      </div>
      <PaperNotice />
    </div>
  );
}
