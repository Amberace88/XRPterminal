"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Pause, Play, Save, StepForward, Trash2 } from "lucide-react";
import { PriceChart, type ChartMarker, type Overlay, type PriceLine } from "@/components/charts/PriceChart";
import { tokenColor } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SourceLine } from "@/components/ui/DataFreshness";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { Field } from "@/components/ui/Misc";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/hooks/useApi";
import { useDailyHistory } from "@/hooks/useMarketData";
import { ema, sma } from "@/lib/analytics/indicators";
import { formatDate, formatDateTime } from "@/lib/format";
import { cancelOrder, closePosition, createAccount, openOrders, placeOrder, processTick, summarize, type CommandResult } from "@/lib/tradelab/engine";
import { REPLAY_SPEEDS, REPLAY_TF_MS, closeTime, replaySnapshot, speedToIntervalMs, stepCandle, visibleCandles, type ReplaySession, type ReplaySpeed, type ReplayTimeframe } from "@/lib/tradelab/replay";
import { tradeStats } from "@/lib/tradelab/stats";
import { DEFAULT_STARTING_CAPITAL, STARTING_CAPITAL_OPTIONS, type AccountState, type LedgerEvent, type OrderInput } from "@/lib/tradelab/types";
import type { Candle, CandleSeries, Provenance } from "@/lib/types/market";
import { ActivityTabs } from "./AccountPanels";
import { OrderTicket } from "./OrderTicket";
import { PaperNotice, PnL, SimTag, pct, px, usd } from "./common";
import { uid, useTradeLab } from "./TradeLabProvider";

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
const DAY = 86_400_000;

interface Run {
  id: string;
  tf: ReplayTimeframe;
  candles: Candle[];
  startIdx: number;
  cursor: number;
  state: AccountState;
  events: LedgerEvent[];
  capital: number;
  provenance: Provenance | null;
  createdAt: number;
}

/** Historical Replay (spec §112–§114, §280–§283). Future candles are never rendered or used. */
export function ReplayView() {
  const { replaySessions, saveReplaySession, removeReplaySession } = useTradeLab();
  const toast = useToast();
  const daily = useDailyHistory("XRP-USD");
  const [tf, setTf] = useState<ReplayTimeframe>("1D");
  const [start, setStart] = useState("");
  const [capital, setCapital] = useState<number>(DEFAULT_STARTING_CAPITAL);
  const [loadingRun, setLoadingRun] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [overlays, setOverlays] = useState({ sma20: true, sma50: true, ema200: false });

  const dailyCandles = daily.data?.candles ?? [];
  const minDate = dailyCandles.length > 60 ? new Date(dailyCandles[60].t).toISOString().slice(0, 10) : "2018-01-01";
  const maxDate = dailyCandles.length > 2 ? new Date(dailyCandles[dailyCandles.length - 2].t).toISOString().slice(0, 10) : undefined;
  useEffect(() => {
    if (!start && dailyCandles.length > 400) setStart(new Date(dailyCandles[dailyCandles.length - 365].t).toISOString().slice(0, 10));
  }, [dailyCandles, start]);

  const begin = async () => {
    setRunErr(null);
    const startT = Date.parse(start);
    if (!Number.isFinite(startT)) return setRunErr("Pick a start date.");
    setLoadingRun(true);
    try {
      let candles: Candle[] = [];
      let provenance: Provenance | null = null;
      if (tf === "1D") {
        candles = dailyCandles;
        provenance = daily.data?.provenance ?? null;
      } else {
        const s = await apiGet<CandleSeries>(`/api/market/candles?pair=XRP-USD&tf=1h&start=${startT - 14 * DAY}&end=${Math.min(Date.now(), startT + 60 * DAY)}`);
        candles = s.candles;
        provenance = s.provenance;
      }
      const startIdx = candles.findIndex((k) => k.t >= startT);
      if (startIdx < 0 || !candles.length) throw new Error("No historical candles are available for that date from the data provider.");
      const tfMs = REPLAY_TF_MS[tf];
      const cursor = Math.max(0, startIdx - 1);
      const id = uid();
      const t0 = closeTime(candles[cursor], tfMs);
      const c = createAccount({ accountId: `replay-${id}`, name: "Replay", startingCapital: capital, t: t0, mode: "REPLAY" });
      const m = processTick(c.state, replaySnapshot(candles[cursor], tfMs), { markEveryTick: true });
      setRun({ id, tf, candles, startIdx, cursor, state: m.state, events: [...c.events, ...m.events], capital, provenance, createdAt: Date.now() });
      setPlaying(false);
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Could not load historical data");
    } finally {
      setLoadingRun(false);
    }
  };

  const apply = useCallback((r: CommandResult) => {
    const cur = runRef.current;
    if (!cur || !r.events.length) return;
    const upd = { ...cur, state: r.state, events: [...cur.events, ...r.events] };
    runRef.current = upd;
    setRun(upd);
  }, []);

  const step = useCallback(() => {
    const cur = runRef.current;
    if (!cur) return false;
    const next = cur.cursor + 1;
    if (next >= cur.candles.length) {
      setPlaying(false);
      return false;
    }
    const r = stepCandle(cur.state, cur.candles[next], REPLAY_TF_MS[cur.tf]);
    const upd = { ...cur, cursor: next, state: r.state, events: [...cur.events, ...r.events] };
    runRef.current = upd;
    setRun(upd);
    return true;
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (!step()) setPlaying(false);
    }, speedToIntervalMs(speed));
    return () => clearInterval(id);
  }, [playing, speed, step]);

  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        step();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, step]);

  if (!run) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-fg">Historical replay</h2>
          <SimTag />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader title="Start a replay session" icon={<History className="h-4 w-4" />} subtitle="Trade a past market as if it were live. Future candles stay hidden." />
            <CardBody className="space-y-3">
              {daily.loading && !daily.data ? (
                <Skeleton className="h-40 w-full" />
              ) : daily.error && !daily.data ? (
                <ErrorState compact message={daily.error.message} onRetry={daily.reload} lastUpdated={daily.updatedAt} />
              ) : (
                <>
                  <Field label="Market">
                    <input className="input" value="XRP-USD" disabled />
                  </Field>
                  <Field label="Timeframe" hint={tf === "1h" ? "Loads ~60 days of hourly candles from the start date (provider permitting)." : "Daily candles from the full history."}>
                    <Tabs value={tf} onChange={setTf} items={[{ value: "1D", label: "Daily" }, { value: "1h", label: "Hourly" }]} ariaLabel="Replay timeframe" />
                  </Field>
                  <Field label="Start date" htmlFor="rp-start">
                    <input id="rp-start" type="date" className="input" min={minDate} max={maxDate} value={start} onChange={(e) => setStart(e.target.value)} />
                  </Field>
                  <Field label="Starting capital (virtual)" htmlFor="rp-cap">
                    <select id="rp-cap" className="select" value={capital} onChange={(e) => setCapital(Number(e.target.value))}>
                      {STARTING_CAPITAL_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {usd(c, 0)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {runErr && <p className="text-xs text-danger">{runErr}</p>}
                  <Button onClick={begin} loading={loadingRun} className="w-full" disabled={!start}>
                    <Play className="h-4 w-4" /> Start replay
                  </Button>
                  <p className="text-2xs text-fg-muted">Orders fill at the next candle&apos;s open (market) or along a deterministic intrabar path (limits/stops). Same fee & slippage model as the live terminal.</p>
                </>
              )}
            </CardBody>
            <CardFooter>
              <SourceLine provenance={daily.data?.provenance} />
            </CardFooter>
          </Card>
          <SavedSessions sessions={replaySessions} onRemove={removeReplaySession} className="lg:col-span-7" />
        </div>
        <PaperNotice />
      </div>
    );
  }

  const tfMs = REPLAY_TF_MS[run.tf];
  const cur = run.candles[run.cursor];
  const nowT = closeTime(cur, tfMs);
  const snap = replaySnapshot(cur, tfMs);
  const sum = summarize(run.state, cur.c, nowT);
  const benchStart = run.candles[run.startIdx]?.o ?? cur.c;
  const benchRet = run.cursor >= run.startIdx ? (((run.capital * (1 - run.state.settings.fees.takerPct / 100)) / benchStart) * cur.c / run.capital - 1) * 100 : 0;
  const barsDone = Math.max(0, run.cursor - run.startIdx + 1);
  const atEnd = run.cursor >= run.candles.length - 1;

  const onPlace = (input: OrderInput) => {
    const r = placeOrder(run.state, input, snap, nowT, { deferToNextTick: true });
    apply(r);
    return r;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-fg">Historical replay</h2>
          <SimTag />
          <Badge tone="info">Replay time {formatDateTime(nowT, "UTC")}</Badge>
          <Badge tone="neutral">{run.tf === "1D" ? "Daily" : "Hourly"} · bar {barsDone}</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPlaying(false);
            setRun(null);
          }}
        >
          End session
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard size="sm" className="p-3" label="Equity" value={usd(sum.equity)} delta={pct(sum.returnPct)} deltaTone={toneOf(sum.returnPct)} />
        <MetricCard size="sm" className="p-3" label="Cash" value={usd(sum.cash)} />
        <MetricCard size="sm" className="p-3" label="Unrealized" value={<PnL value={sum.unrealizedPnl} />} />
        <MetricCard size="sm" className="p-3" label="Closed trades" value={String(run.state.trades.length)} />
        <MetricCard size="sm" className="p-3" label="Max drawdown" value={pct(-run.state.maxDrawdownPct)} />
        <MetricCard size="sm" className="p-3" label="Buy & hold (same period)" value={pct(benchRet)} deltaTone={toneOf(benchRet)} info="XRP bought at the first replay candle's open with the same capital and one taker fee." />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  XRP-USD <span className="num text-fg-secondary">{px(cur.c)}</span>
                </span>
              }
              subtitle="Only candles up to the replay time are shown; indicators use revealed data only."
              actions={
                <div className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-muted">
                  {(["sma20", "sma50", "ema200"] as const).map((k) => (
                    <label key={k} className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} />
                      {k.toUpperCase().replace(/(\d+)/, " $1")}
                    </label>
                  ))}
                </div>
              }
            />
            <div className="px-2 pt-2 sm:px-3">
              <ReplayChart candles={visibleCandles(run.candles, run.cursor)} state={run.state} overlays={overlays} tfMs={tfMs} fitKey={run.id} />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-3 sm:px-5">
              <Button size="sm" variant={playing ? "secondary" : "primary"} onClick={() => setPlaying((p) => !p)} disabled={atEnd} aria-label={playing ? "Pause replay" : "Play replay"}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPlaying(false);
                  step();
                }}
                disabled={atEnd}
                aria-label="Next candle"
              >
                <StepForward className="h-3.5 w-3.5" /> Step
              </Button>
              <Tabs value={String(speed)} onChange={(v) => setSpeed(Number(v) as ReplaySpeed)} size="xs" ariaLabel="Replay speed" items={REPLAY_SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))} />
              <span className="ml-auto text-2xs text-fg-muted">{atEnd ? "End of available data" : "Space play/pause · → step"}</span>
            </div>
            <CardFooter>
              <SourceLine provenance={run.provenance} />
              <span>1x = 1 candle / second</span>
            </CardFooter>
          </Card>
          <Card>
            <ActivityTabs
              state={run.state}
              summary={sum}
              onCancel={(id) => apply(cancelOrder(run.state, id, nowT))}
              onClose={() => {
                const r = closePosition(run.state, snap, nowT, { deferToNextTick: true });
                if (r) apply(r);
                toast({ title: "Close order queued", description: "Executes at the next candle open." });
              }}
            />
          </Card>
        </div>
        <aside className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader title="Replay order ticket" actions={<SimTag />} />
            <CardBody className="pt-3">
              <OrderTicket state={run.state} snapshot={snap} now={() => nowT} onPlace={onPlace} mode="replay" />
            </CardBody>
          </Card>
          <SaveSessionCard run={run} nowT={nowT} benchRet={benchRet} onSave={saveReplaySession} />
        </aside>
      </div>
      <PaperNotice />
    </div>
  );
}

function ReplayChart({ candles, state, overlays, tfMs, fitKey }: { candles: Candle[]; state: AccountState; overlays: { sma20: boolean; sma50: boolean; ema200: boolean }; tfMs: number; fitKey: string }) {
  // indicators computed ONLY from revealed candles (spec §282)
  const ov = useMemo<Overlay[]>(() => {
    const closes = candles.map((k) => k.c);
    const mk = (id: string, label: string, s: (number | null)[], colorToken: string): Overlay => ({ id, label, points: candles.map((k, i) => ({ t: k.t, v: s[i] })), color: tokenColor(colorToken, 0.9) });
    const out: Overlay[] = [];
    if (overlays.sma20) out.push(mk("sma20", "SMA 20", sma(closes, 20), "warning"));
    if (overlays.sma50) out.push(mk("sma50", "SMA 50", sma(closes, 50), "info"));
    if (overlays.ema200) out.push(mk("ema200", "EMA 200", ema(closes, 200), "text-secondary"));
    return out;
  }, [candles, overlays]);
  const lines = useMemo<PriceLine[]>(() => {
    const out: PriceLine[] = [];
    if (state.position) out.push({ price: Number(state.position.avgEntry), label: "Avg entry", color: tokenColor("accent"), dashed: false });
    for (const o of openOrders(state)) {
      const lvl = o.role === "STOP_LOSS" || o.type === "STOP" || (o.type === "STOP_LIMIT" && !o.triggeredAt) ? o.stopPrice : o.limitPrice;
      if (lvl) out.push({ price: Number(lvl), label: o.role === "STOP_LOSS" ? "SL" : o.role === "TAKE_PROFIT" ? "TP" : `${o.side} ${o.type}`, color: tokenColor(o.role === "STOP_LOSS" ? "danger" : o.role === "TAKE_PROFIT" ? "success" : "text-muted") });
    }
    return out;
  }, [state]);
  const markers = useMemo<ChartMarker[]>(
    () =>
      state.fills.map((f) => ({
        t: Math.floor(f.t / tfMs) * tfMs,
        position: f.side === "BUY" ? "belowBar" : "aboveBar",
        shape: f.side === "BUY" ? "arrowUp" : "arrowDown",
        color: tokenColor(f.side === "BUY" ? "success" : "danger"),
        text: f.side === "BUY" ? "B" : "S",
      })),
    [state.fills, tfMs],
  );
  if (!candles.length) return <EmptyState title="No candles revealed yet" />;
  return <PriceChart candles={candles} overlays={ov} priceLines={lines} markers={markers} height={400} fitKey={fitKey} />;
}

function SaveSessionCard({ run, nowT, benchRet, onSave }: { run: Run; nowT: number; benchRet: number; onSave: (s: ReplaySession) => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const cur = run.candles[run.cursor];
      const sum = summarize(run.state, cur.c, nowT);
      const st = tradeStats(run.state.trades, run.capital, sum.equity);
      const s: ReplaySession = {
        id: run.id,
        name: name.trim() || `Replay ${formatDate(run.candles[run.startIdx]?.t ?? cur.t)}`,
        market: "XRP-USD",
        timeframe: run.tf,
        startT: run.candles[run.startIdx]?.t ?? cur.t,
        endT: nowT,
        capital: run.capital,
        accountId: run.state.accountId,
        events: run.events,
        performance: { returnPct: sum.returnPct, netPnl: sum.netPnl, trades: st.totalTrades, winRate: st.winRate, maxDrawdownPct: run.state.maxDrawdownPct, benchmarkReturnPct: benchRet, fees: sum.feesPaid },
        strategy: strategy.trim(),
        notes: notes.trim(),
        createdAt: run.createdAt,
        savedAt: Date.now(),
      };
      await onSave(s);
      toast({ tone: "success", title: "Replay session saved", description: "Stored with its simulated ledger and performance." });
    } catch (e) {
      toast({ tone: "danger", title: "Could not save session", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Save session" icon={<Save className="h-4 w-4" />} subtitle="Saving again updates the same session." />
      <CardBody className="space-y-2 pt-2">
        <input className="input h-9" placeholder="Session name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Session name" />
        <input className="input h-9" placeholder="Strategy used (optional)" value={strategy} onChange={(e) => setStrategy(e.target.value)} maxLength={200} aria-label="Strategy" />
        <textarea className="input h-20 py-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} aria-label="Notes" />
        <Button size="sm" className="w-full" onClick={save} loading={busy}>
          <Save className="h-3.5 w-3.5" /> Save replay session
        </Button>
      </CardBody>
    </Card>
  );
}

function SavedSessions({ sessions, onRemove, className }: { sessions: ReplaySession[]; onRemove: (id: string) => Promise<void>; className?: string }) {
  const cols: Column<ReplaySession>[] = [
    { key: "name", header: "Session", value: (s) => s.name, cell: (s) => <span className="font-medium text-fg">{s.name}</span> },
    { key: "range", header: "Period", value: (s) => s.startT, cell: (s) => <span className="text-2xs text-fg-muted">{formatDate(s.startT)} → {formatDate(s.endT)} · {s.timeframe}</span> },
    { key: "trades", header: "Trades", align: "right", value: (s) => s.performance.trades, cell: (s) => s.performance.trades },
    { key: "ret", header: "Return", align: "right", value: (s) => s.performance.returnPct, cell: (s) => <span className={s.performance.returnPct >= 0 ? "text-success" : "text-danger"}>{pct(s.performance.returnPct)}</span> },
    { key: "bh", header: "Buy & hold", align: "right", hideBelow: "sm", value: (s) => s.performance.benchmarkReturnPct, cell: (s) => pct(s.performance.benchmarkReturnPct) },
    { key: "dd", header: "Max DD", align: "right", hideBelow: "sm", value: (s) => s.performance.maxDrawdownPct, cell: (s) => pct(-s.performance.maxDrawdownPct) },
    { key: "saved", header: "Saved", hideBelow: "md", value: (s) => s.savedAt, cell: (s) => <span className="text-2xs text-fg-muted">{formatDate(s.savedAt)}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (s) => (
        <Button size="xs" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => onRemove(s.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];
  return (
    <Card className={className}>
      <CardHeader title="Saved replay sessions" subtitle="SIMULATED results on historical data" actions={<SimTag />} />
      <div className="pb-2">
        <DataTable rows={sessions} columns={cols} rowKey={(s) => s.id} empty={{ title: "No saved sessions yet", description: "Run a replay and save it to keep its trades, performance and notes." }} pageSize={8} />
      </div>
    </Card>
  );
}
