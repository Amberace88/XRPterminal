"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare, Play, Plus, Trash2, TriangleAlert, Workflow } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LineChart } from "@/components/charts/Charts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SourceLine } from "@/components/ui/DataFreshness";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { Field } from "@/components/ui/Misc";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { apiGet, useApi } from "@/hooks/useApi";
import { useDailyHistory } from "@/hooks/useMarketData";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import {
  INDICATORS,
  OP_LABEL,
  REGIME_LABELS,
  STRATEGY_TEMPLATES,
  createStrategy,
  describeCondition,
  indicatorMeta,
  overfittingWarnings,
  runBacktest,
  saveStrategyVersion,
  type BacktestResult,
  type BacktestTrade,
  type CompareOp,
  type Condition,
  type IndicatorId,
  type Operand,
  type RuleGroup,
  type Strategy,
  type StrategyRules,
} from "@/lib/tradelab/backtest";
import type { SavedBacktest } from "@/lib/tradelab/repo";
import { STARTING_CAPITAL_OPTIONS } from "@/lib/tradelab/types";
import type { Candle, CandleSeries } from "@/lib/types/market";
import { KV, NumInput, PaperNotice, PnL, SimTag, pct, px, sample, usd } from "./common";
import { uid, useTradeLab } from "./TradeLabProvider";

const DAY = 86_400_000;
const cid = () => Math.random().toString(36).slice(2, 9);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const pf = (v: number | null) => (v === null ? "—" : Number.isFinite(v) ? v.toFixed(2) : "∞");
const usesBtc = (r: StrategyRules) =>
  [...r.entry.conditions, ...r.exit.conditions].some((c) => c.type === "compare" && [c.left, c.right].some((o) => o.kind === "ind" && indicatorMeta(o.ind).needs === "btc"));
const usesDailyOnly = (r: StrategyRules) =>
  [...r.entry.conditions, ...r.exit.conditions].some((c) => c.type === "regime" || (c.type === "compare" && [c.left, c.right].some((o) => o.kind === "ind" && indicatorMeta(o.ind).dailyOnly)));

const blankRules = (): StrategyRules => ({
  entry: { logic: "AND", conditions: [{ id: cid(), type: "compare", left: { kind: "ind", ind: "RSI", period: 14 }, op: "lt", right: { kind: "value", value: 30 } }] },
  exit: { logic: "OR", conditions: [{ id: cid(), type: "compare", left: { kind: "ind", ind: "RSI", period: 14 }, op: "gt", right: { kind: "value", value: 60 } }] },
  stopLossPct: 2,
  takeProfitPct: 5,
  positionSizePct: 100,
});

export function StrategyView() {
  const { strategies, saveStrategy, removeStrategy, backtests, saveBacktest, loading } = useTradeLab();
  const toast = useToast();
  const daily = useDailyHistory("XRP-USD");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("My strategy");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<StrategyRules>(blankRules);
  const [tf, setTf] = useState<"1D" | "1h">("1D");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [capital, setCapital] = useState(100_000);
  const [feePct, setFeePct] = useState("0.1");
  const [slipBps, setSlipBps] = useState("5");
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: BacktestResult; strategyName: string; version: number } | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const needBtc = usesBtc(rules);
  const btc = useApi<CandleSeries>(needBtc && tf === "1D" ? "/api/market/history?pair=BTC-USD" : null, { staleMs: 30 * 60_000 });

  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const dailyCandles = useMemo(() => daily.data?.candles ?? [], [daily.data]);
  useEffect(() => {
    if (dailyCandles.length && !to) {
      const last = dailyCandles[dailyCandles.length - 1].t;
      setTo(iso(last));
      setFrom(iso(Math.max(dailyCandles[0].t, last - 3 * 365 * DAY)));
    }
  }, [dailyCandles, to]);

  const load = (s: Strategy, version?: number) => {
    const v = version ? s.versions.find((x) => x.version === version) : null;
    setSelectedId(s.id);
    setName(s.name);
    setDescription(s.description);
    setRules(JSON.parse(JSON.stringify(v?.rules ?? s.rules)) as StrategyRules);
    setResult(null);
  };
  const fromTemplate = (i: number) => {
    const t = STRATEGY_TEMPLATES[i];
    setSelectedId(null);
    setName(t.name);
    setDescription(t.description);
    setRules(JSON.parse(JSON.stringify(t.rules)) as StrategyRules);
    setResult(null);
  };

  const persist = async (bumpRuns: boolean): Promise<Strategy> => {
    const now = Date.now();
    let s = selected ? saveStrategyVersion({ ...selected, name: name.trim() || selected.name, description }, rules, now, "Edited in Strategy Lab") : createStrategy(uid(), name.trim() || "Strategy", rules, now, description);
    if (selected && (s.name !== selected.name || s.description !== selected.description)) s = { ...s, updatedAt: now };
    if (bumpRuns) s = { ...s, backtestRuns: s.backtestRuns + 1, updatedAt: now };
    await saveStrategy(s);
    setSelectedId(s.id);
    return s;
  };

  const save = async () => {
    try {
      const before = selected?.version;
      const s = await persist(false);
      toast({ tone: "success", title: before && s.version !== before ? `Saved as version ${s.version}` : "Strategy saved", description: before && s.version === before ? "Rules unchanged — version kept." : undefined });
    } catch (e) {
      toast({ tone: "danger", title: "Could not save strategy", description: e instanceof Error ? e.message : undefined });
    }
  };

  const run = async () => {
    setRunErr(null);
    const fromT = Date.parse(from);
    const toT = Date.parse(to) + DAY - 1;
    if (!Number.isFinite(fromT) || !Number.isFinite(toT) || fromT >= toT) return setRunErr("Choose a valid date range.");
    if (!rules.entry.conditions.length) return setRunErr("Add at least one entry condition.");
    if (tf === "1h" && usesDailyOnly(rules)) return setRunErr("Regime and XRP/BTC conditions are only available on the daily timeframe.");
    setRunning(true);
    try {
      let candles: Candle[];
      if (tf === "1D") {
        candles = dailyCandles;
      } else {
        const s = await apiGet<CandleSeries>(`/api/market/candles?pair=XRP-USD&tf=1h&start=${fromT - 30 * DAY}&end=${toT}`);
        candles = s.candles;
      }
      if (!candles.length) throw new Error("No historical candles returned by the data provider.");
      if (needBtc && tf === "1D" && !btc.data?.candles.length) throw new Error("BTC-USD history is required for XRP/BTC conditions and is not available right now.");
      const s = await persist(true);
      const cfg = { from: fromT, to: toT, capital, feePct: Math.max(0, Number(feePct) || 0), slippageBps: Math.max(0, Number(slipBps) || 0), timeframe: tf };
      const r = runBacktest(candles, s.rules, cfg, { btc: needBtc ? btc.data?.candles ?? null : null, ranAt: Date.now(), rulesVersion: s.version });
      r.warnings = overfittingWarnings(r, s.rules, s.backtestRuns);
      setResult({ r, strategyName: s.name, version: s.version });
      await saveBacktest({ id: uid(), strategyId: s.id, strategyName: s.name, strategyVersion: s.version, result: { ...r, equity: sample(r.equity, 400) } });
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Skeleton className="h-[600px] w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-fg">Strategy Lab</h2>
        <SimTag />
        <span className="text-2xs text-fg-muted">Rules → signals at bar close → execution at next bar open. No lookahead.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-3">
          <CardHeader title="Strategies" icon={<Workflow className="h-4 w-4" />} />
          <CardBody className="space-y-3 pt-2">
            {strategies.length ? (
              <ul className="space-y-1">
                {strategies.map((s) => (
                  <li key={s.id} className={cn("group flex items-center justify-between rounded-lg px-2 py-1.5 text-xs", s.id === selectedId ? "bg-accent/10 text-fg" : "text-fg-secondary hover:bg-surface-hover")}>
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => load(s)}>
                      {s.name} <span className="text-fg-muted">v{s.version}</span>
                    </button>
                    <button aria-label={`Delete ${s.name}`} className="opacity-60 hover:text-danger group-hover:opacity-100" onClick={() => removeStrategy(s.id).then(() => s.id === selectedId && setSelectedId(null))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-muted">No saved strategies yet.</p>
            )}
            <div>
              <p className="label mb-1">Start from a template</p>
              <ul className="space-y-1">
                {STRATEGY_TEMPLATES.map((t, i) => (
                  <li key={t.name}>
                    <button className="w-full rounded-lg border border-border-subtle px-2 py-1.5 text-left text-xs text-fg-secondary hover:border-accent/50 hover:text-fg" onClick={() => fromTemplate(i)}>
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                size="xs"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setSelectedId(null);
                  setName("My strategy");
                  setDescription("");
                  setRules(blankRules());
                  setResult(null);
                }}
              >
                <Plus className="h-3 w-3" /> Blank strategy
              </Button>
            </div>
            <p className="text-2xs leading-relaxed text-fg-muted">Templates are starting points for testing, not recommendations.</p>
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-4 lg:col-span-9">
          <Card>
            <CardHeader
              title="Rule builder"
              subtitle={selected ? `Editing v${selected.version} · changing rules saves a new version` : "New strategy (unsaved)"}
              actions={
                <div className="flex items-center gap-2">
                  {selected && selected.versions.length > 1 && (
                    <select aria-label="Load version" className="select h-8 w-28 text-xs" value="" onChange={(e) => e.target.value && load(selected, Number(e.target.value))}>
                      <option value="">Versions…</option>
                      {selected.versions.map((v) => (
                        <option key={v.version} value={v.version}>
                          v{v.version} · {formatDate(v.createdAt)}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button size="xs" variant="outline" onClick={save}>
                    Save
                  </Button>
                </div>
              }
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="st-name">
                  <input id="st-name" className="input h-9" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor="st-desc">
                  <input id="st-desc" className="input h-9" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
                </Field>
              </div>
              <GroupEditor title="IF (entry conditions)" group={rules.entry} onChange={(g) => setRules({ ...rules, entry: g })} then="THEN buy at next bar open" />
              <GroupEditor title="EXIT when" group={rules.exit} onChange={(g) => setRules({ ...rules, exit: g })} then="THEN sell at next bar open" optional />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Stop-loss %" hint="Empty = none" htmlFor="st-sl">
                  <NumInput id="st-sl" value={rules.stopLossPct === null ? "" : String(rules.stopLossPct)} onChange={(v) => setRules({ ...rules, stopLossPct: v.trim() === "" ? null : Math.max(0.1, Math.min(90, Number(v) || 0)) })} suffix="%" />
                </Field>
                <Field label="Take-profit %" hint="Empty = none" htmlFor="st-tp">
                  <NumInput id="st-tp" value={rules.takeProfitPct === null ? "" : String(rules.takeProfitPct)} onChange={(v) => setRules({ ...rules, takeProfitPct: v.trim() === "" ? null : Math.max(0.1, Math.min(1000, Number(v) || 0)) })} suffix="%" />
                </Field>
                <Field label="Position size" hint="% of cash per entry" htmlFor="st-size">
                  <NumInput id="st-size" value={String(rules.positionSizePct)} onChange={(v) => setRules({ ...rules, positionSizePct: Math.max(1, Math.min(100, Number(v) || 1)) })} suffix="%" />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Backtest settings" subtitle="Every backtest states its range, capital, fees, slippage, timeframe and rules." actions={<SimTag />} />
            <CardBody className="space-y-3">
              {daily.loading && !daily.data ? (
                <Skeleton className="h-24 w-full" />
              ) : daily.error && !daily.data ? (
                <ErrorState compact message={daily.error.message} onRetry={daily.reload} lastUpdated={daily.updatedAt} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <Field label="Timeframe" className="col-span-2">
                      <Tabs value={tf} onChange={setTf} ariaLabel="Backtest timeframe" items={[{ value: "1D", label: "Daily" }, { value: "1h", label: "Hourly" }]} />
                    </Field>
                    <Field label="From" htmlFor="bt-from">
                      <input id="bt-from" type="date" className="input h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </Field>
                    <Field label="To" htmlFor="bt-to">
                      <input id="bt-to" type="date" className="input h-9" value={to} onChange={(e) => setTo(e.target.value)} />
                    </Field>
                    <Field label="Capital" htmlFor="bt-cap">
                      <select id="bt-cap" className="select h-9" value={capital} onChange={(e) => setCapital(Number(e.target.value))}>
                        {STARTING_CAPITAL_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {usd(c, 0)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Fee" htmlFor="bt-fee">
                        <NumInput id="bt-fee" value={feePct} onChange={setFeePct} suffix="%" />
                      </Field>
                      <Field label="Slip." htmlFor="bt-slip">
                        <NumInput id="bt-slip" value={slipBps} onChange={setSlipBps} suffix="bp" />
                      </Field>
                    </div>
                  </div>
                  {tf === "1h" && <p className="text-2xs text-fg-muted">Hourly history depends on provider limits; the loaded range is shown with the results.</p>}
                  {runErr && <p className="text-xs text-danger">{runErr}</p>}
                  <Button onClick={run} loading={running}>
                    <Play className="h-4 w-4" /> Run backtest
                  </Button>
                </>
              )}
            </CardBody>
            <CardFooter>
              <SourceLine provenance={daily.data?.provenance} />
              <span>Hypothetical, simulated</span>
            </CardFooter>
          </Card>

          {result && <BacktestResults result={result.r} name={result.strategyName} version={result.version} rules={rules} />}
          <CompareCard backtests={backtests} selected={compare} setSelected={setCompare} />
        </div>
      </div>
      <PaperNotice />
    </div>
  );
}

/* ---------------------------------------------------------------- builder */

function GroupEditor({ title, group, onChange, then, optional }: { title: string; group: RuleGroup; onChange: (g: RuleGroup) => void; then: string; optional?: boolean }) {
  const upd = (i: number, c: Condition) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  const del = (i: number) => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });
  return (
    <fieldset className="rounded-xl border border-border-subtle p-3">
      <legend className="flex items-center gap-2 px-1">
        <span className="label">{title}</span>
      </legend>
      <div className="mb-2 flex items-center gap-2 text-2xs text-fg-muted">
        Combine with
        <Tabs value={group.logic} onChange={(v) => onChange({ ...group, logic: v })} size="xs" ariaLabel={`${title} logic`} items={[{ value: "AND", label: "AND" }, { value: "OR", label: "OR" }]} />
      </div>
      <ul className="space-y-2">
        {group.conditions.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2">
            {i > 0 && <Badge tone="accent">{group.logic}</Badge>}
            <ConditionRow c={c} onChange={(x) => upd(i, x)} />
            <button type="button" aria-label="Remove condition" className="rounded p-1 text-fg-muted hover:text-danger" onClick={() => del(i)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!group.conditions.length && <li className="text-2xs text-fg-muted">{optional ? "No exit rule — exits only by stop / target / end of test." : "Add at least one condition."}</li>}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="xs" variant="ghost" onClick={() => onChange({ ...group, conditions: [...group.conditions, { id: cid(), type: "compare", left: { kind: "ind", ind: "PRICE" }, op: "gt", right: { kind: "ind", ind: "SMA", period: 50 } }] })}>
          <Plus className="h-3 w-3" /> Condition
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onChange({ ...group, conditions: [...group.conditions, { id: cid(), type: "regime", regime: "TRENDING UP" }] })}>
          <Plus className="h-3 w-3" /> Regime filter
        </Button>
        <span className="ml-auto text-2xs font-medium text-fg-secondary">{then}</span>
      </div>
    </fieldset>
  );
}

function ConditionRow({ c, onChange }: { c: Condition; onChange: (c: Condition) => void }) {
  if (c.type === "regime") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-fg-secondary">Regime</span>
        <select aria-label="Regime operator" className="select h-8 w-24 text-xs" value={c.negate ? "not" : "is"} onChange={(e) => onChange({ ...c, negate: e.target.value === "not" })}>
          <option value="is">is</option>
          <option value="not">is not</option>
        </select>
        <select aria-label="Regime" className="select h-8 w-44 text-xs" value={c.regime} onChange={(e) => onChange({ ...c, regime: e.target.value as typeof c.regime })}>
          {REGIME_LABELS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-2xs text-fg-muted">(daily, causal)</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OperandEditor o={c.left} onChange={(left) => onChange({ ...c, left })} allowValue={false} />
      <select aria-label="Operator" className="select h-8 w-32 text-xs" value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as CompareOp })}>
        {(Object.keys(OP_LABEL) as CompareOp[]).map((k) => (
          <option key={k} value={k}>
            {OP_LABEL[k]}
          </option>
        ))}
      </select>
      <OperandEditor o={c.right} onChange={(right) => onChange({ ...c, right })} allowValue />
    </div>
  );
}

function OperandEditor({ o, onChange, allowValue }: { o: Operand; onChange: (o: Operand) => void; allowValue: boolean }) {
  const sel = o.kind === "value" ? "__value" : o.ind;
  const meta = o.kind === "ind" ? indicatorMeta(o.ind) : null;
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Operand"
        className="select h-8 w-44 text-xs"
        value={sel}
        title={meta?.help}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__value") onChange({ kind: "value", value: 0 });
          else {
            const m = indicatorMeta(v as IndicatorId);
            onChange({ kind: "ind", ind: v as IndicatorId, period: m.period?.default });
          }
        }}
      >
        {allowValue && <option value="__value">Value…</option>}
        {INDICATORS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {o.kind === "value" && <NumInput ariaLabel="Value" value={String(o.value)} onChange={(v) => onChange({ kind: "value", value: Number(v) })} className="w-24" />}
      {o.kind === "ind" && meta?.period && (
        <NumInput ariaLabel="Period" value={String(o.period ?? meta.period.default)} onChange={(v) => onChange({ ...o, period: Math.round(Number(v)) || meta.period!.default })} className="w-20" suffix="n" step="1" min={meta.period.min} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- results */

function BacktestResults({ result: r, name, version, rules }: { result: BacktestResult; name: string; version: number; rules: StrategyRules }) {
  const eqRows = sample(r.equity).map((p) => ({ t: p.t, Strategy: p.equity, "Buy & hold XRP": p.benchmark }));
  let peak = -Infinity;
  const ddRows = sample(r.equity).map((p) => {
    peak = Math.max(peak, p.equity);
    return { t: p.t, Drawdown: peak > 0 ? -((peak - p.equity) / peak) * 100 : 0 };
  });
  const df = (x: string | number) => formatDate(Number(x));
  const cols: Column<BacktestTrade>[] = [
    { key: "in", header: "Entry", value: (t) => t.openedAt, cell: (t) => <span className="text-fg-muted">{formatDateTime(t.openedAt, "UTC", false)}</span> },
    { key: "out", header: "Exit", value: (t) => t.closedAt, cell: (t) => <span className="text-fg-muted">{formatDateTime(t.closedAt, "UTC", false)}</span> },
    { key: "ep", header: "Entry px", align: "right", value: (t) => t.avgEntry, cell: (t) => px(t.avgEntry) },
    { key: "xp", header: "Exit px", align: "right", value: (t) => t.avgExit, cell: (t) => px(t.avgExit) },
    { key: "net", header: "Net P&L", align: "right", value: (t) => t.netPnl, cell: (t) => <PnL value={t.netPnl} /> },
    { key: "ret", header: "Return", align: "right", hideBelow: "sm", value: (t) => t.returnPct, cell: (t) => pct(t.returnPct) },
    { key: "r", header: "R", align: "right", hideBelow: "sm", value: (t) => t.rMultiple, cell: (t) => (t.rMultiple !== null ? `${t.rMultiple.toFixed(2)}R` : "—") },
    { key: "why", header: "Exit reason", hideBelow: "md", value: (t) => t.exitReason, cell: (t) => <Badge tone={t.exitReason === "STOP" ? "danger" : t.exitReason === "TARGET" ? "success" : "neutral"}>{t.exitReason.replace(/_/g, " ")}</Badge> },
    { key: "bars", header: "Bars", align: "right", hideBelow: "lg", value: (t) => t.bars, cell: (t) => t.bars },
  ];
  return (
    <Card className="animate-fade-up">
      <CardHeader title={`Backtest — ${name} v${version}`} subtitle={`${r.config.timeframe} · ${r.firstT ? formatDate(r.firstT) : "—"} → ${r.lastT ? formatDate(r.lastT) : "—"} · ${r.bars} bars (+${r.warmupBars} warm-up)`} actions={<SimTag />} />
      <CardBody className="space-y-4">
        {r.warnings.length > 0 && (
          <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
              <TriangleAlert className="h-3.5 w-3.5" /> Overfitting / evidence warning
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-fg-secondary">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <MetricCard size="sm" className="p-3" label="Return" value={pct(r.returnPct)} deltaTone={toneOf(r.returnPct)} />
          <MetricCard size="sm" className="p-3" label="Net P&L" value={<PnL value={r.netPnl} />} />
          <MetricCard size="sm" className="p-3" label="Buy & hold" value={pct(r.benchmarkReturnPct)} />
          <MetricCard size="sm" className="p-3" label="Max drawdown" value={pct(-r.drawdown.maxDrawdownPct)} info={GLOSSARY.drawdown} />
          <MetricCard size="sm" className="p-3" label="Win rate" value={r.stats.winRate !== null ? pct(r.stats.winRate, 1, false) : "—"} />
          <MetricCard size="sm" className="p-3" label="Profit factor" value={pf(r.stats.profitFactor)} info={GLOSSARY.profitFactor} />
          <MetricCard size="sm" className="p-3" label="Trades" value={String(r.stats.totalTrades)} />
          <MetricCard size="sm" className="p-3" label="Time in market" value={pct(r.exposurePct, 0, false)} />
        </div>
        {eqRows.length > 1 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="label mb-1">Equity vs buy-and-hold (same capital, same period)</p>
              <LineChart data={eqRows} x="t" series={[{ key: "Strategy", label: "Strategy (simulated)" }, { key: "Buy & hold XRP", label: "Buy & hold XRP", dashed: true }]} xFormat={df} yFormat={(y) => usd(y, 0)} height={260} />
            </div>
            <div>
              <p className="label mb-1">Drawdown</p>
              <LineChart data={ddRows} x="t" series={[{ key: "Drawdown", label: "Drawdown %" }]} area xFormat={df} yFormat={(y) => `${y.toFixed(0)}%`} height={260} />
            </div>
          </div>
        ) : (
          <EmptyState title="No bars in range" description="The selected range contains no candles from the provider." />
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="label mb-1">Trades</p>
            <DataTable rows={[...r.trades].reverse()} columns={cols} rowKey={(t) => t.id} csvName="backtest-trades-simulated" empty={{ title: "No trades", description: "The entry rules never triggered in this range." }} pageSize={10} />
          </div>
          <div className="space-y-3">
            <div>
              <p className="label mb-1">Rules tested</p>
              <ul className="space-y-0.5 text-xs text-fg-secondary">
                <li>
                  <span className="text-fg-muted">Entry ({rules.entry.logic}):</span> {rules.entry.conditions.map(describeCondition).join(` ${rules.entry.logic} `) || "—"}
                </li>
                <li>
                  <span className="text-fg-muted">Exit ({rules.exit.logic}):</span> {rules.exit.conditions.map(describeCondition).join(` ${rules.exit.logic} `) || "—"}
                </li>
                <li>
                  <span className="text-fg-muted">Stop / target / size:</span> {rules.stopLossPct ?? "—"}% / {rules.takeProfitPct ?? "—"}% / {rules.positionSizePct}%
                </li>
              </ul>
            </div>
            <div>
              <p className="label mb-1">Assumptions</p>
              <ul className="list-disc space-y-1 pl-4 text-2xs leading-relaxed text-fg-muted">
                {r.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <KV label="Avg holding" value={formatDuration(r.stats.avgHoldingMs)} />
            <KV label="Fees paid" value={usd(r.stats.totalFees)} />
            <KV label="Avg R" value={r.stats.avgR !== null ? `${r.stats.avgR.toFixed(2)}R` : "—"} />
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <span>Past optimization does not guarantee future performance.</span>
        <span>Ran {formatDateTime(r.ranAt)}</span>
      </CardFooter>
    </Card>
  );
}

function CompareCard({ backtests, selected, setSelected }: { backtests: SavedBacktest[]; selected: string[]; setSelected: (ids: string[]) => void }) {
  const chosen = backtests.filter((b) => selected.includes(b.id));
  const consistency = (r: BacktestResult) => {
    const m = new Map<string, number>();
    for (const t of r.trades) {
      const d = new Date(t.closedAt);
      const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      m.set(k, (m.get(k) ?? 0) + t.netPnl);
    }
    const v = [...m.values()];
    return v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : null;
  };
  const rows: { label: string; get: (r: BacktestResult) => React.ReactNode }[] = [
    { label: "Period", get: (r) => `${r.firstT ? formatDate(r.firstT) : "—"} → ${r.lastT ? formatDate(r.lastT) : "—"} (${r.config.timeframe})` },
    { label: "Return", get: (r) => pct(r.returnPct) },
    { label: "Buy & hold (same period)", get: (r) => pct(r.benchmarkReturnPct) },
    { label: "Max drawdown", get: (r) => pct(-r.drawdown.maxDrawdownPct) },
    { label: "Profit factor", get: (r) => pf(r.stats.profitFactor) },
    { label: "Win rate", get: (r) => (r.stats.winRate !== null ? pct(r.stats.winRate, 1, false) : "—") },
    { label: "Trade count", get: (r) => r.stats.totalTrades },
    { label: "Consistency (positive months)", get: (r) => pct(consistency(r), 0, false) },
    { label: "Time in market", get: (r) => pct(r.exposurePct, 0, false) },
    { label: "Fees / slippage", get: (r) => `${r.config.feePct}% / ${r.config.slippageBps} bps` },
    {
      label: "Warnings",
      get: (r) => {
        const n = r.warnings.filter((w) => !w.startsWith("Past optimization")).length;
        return n ? <span className="text-warning">{n}</span> : "0";
      },
    },
  ];
  return (
    <Card>
      <CardHeader title="Compare strategies" icon={<GitCompare className="h-4 w-4" />} subtitle="Side-by-side facts only. No strategy is labelled 'best' — context (period, risk, sample size) matters." />
      <CardBody className="space-y-3 pt-2">
        {backtests.length === 0 ? (
          <EmptyState title="No backtests yet" description="Run backtests to compare them here." className="py-6" />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {backtests.map((b) => (
                <label key={b.id} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-2xs", selected.includes(b.id) ? "border-accent bg-accent/10 text-fg" : "border-border-subtle text-fg-muted")}>
                  <input type="checkbox" className="sr-only" checked={selected.includes(b.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, b.id].slice(-4) : selected.filter((x) => x !== b.id))} />
                  {b.strategyName} v{b.strategyVersion} · {formatDate(b.result.ranAt)}
                </label>
              ))}
            </div>
            {chosen.length >= 2 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="label py-2 pr-3 text-left">Metric</th>
                      {chosen.map((b) => (
                        <th key={b.id} className="label py-2 pr-3 text-right">
                          {b.strategyName} v{b.strategyVersion}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="num">
                    {rows.map((row) => (
                      <tr key={row.label} className="border-b border-border-subtle/60">
                        <td className="py-1.5 pr-3 text-fg-muted">{row.label}</td>
                        {chosen.map((b) => (
                          <td key={b.id} className="py-1.5 pr-3 text-right text-fg">
                            {row.get(b.result)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-fg-muted">Select two to four backtests to compare.</p>
            )}
          </>
        )}
      </CardBody>
      <CardFooter>
        <span>SIMULATED · hypothetical · different periods are not directly comparable</span>
      </CardFooter>
    </Card>
  );
}
