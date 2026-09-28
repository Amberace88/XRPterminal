"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, NotebookPen, Pencil, Search, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, NotConnected, Skeleton, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { apiPost, useApi, ApiError } from "@/hooks/useApi";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { EMOTIONS, MISTAKE_TAGS, NEGATIVE_TAGS, REGIME_OPTIONS, emptyJournal, filterJournal, normalizeTag, ruleBasedCoach, type JournalEntry, type JournalFilter, type JournalRow, type RuleCoachSummary } from "@/lib/tradelab/journal";
import { tradeStats } from "@/lib/tradelab/stats";
import type { ClosedTrade } from "@/lib/tradelab/types";
import { KV, NumInput, PaperNotice, PnL, SimTag, pct, px, usd } from "./common";
import { uid, useTradeLab } from "./TradeLabProvider";

const tagTone = (t: string) => (NEGATIVE_TAGS.includes(t) ? "danger" : t === "GOOD_SETUP" || t === "FOLLOWED_PLAN" ? "success" : "neutral");

export function JournalView() {
  const { state, journal, accountId, loading, saveJournal, removeJournal } = useTradeLab();
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<JournalFilter>({ result: "all" });
  const [editing, setEditing] = useState<ClosedTrade | null>(null);

  const trades = useMemo(() => state?.trades ?? [], [state]);
  const mine = useMemo(() => journal.filter((j) => j.accountId === accountId), [journal, accountId]);
  const rows: JournalRow[] = useMemo(() => {
    const m = new Map(mine.map((j) => [j.tradeId, j]));
    return [...trades].reverse().map((t) => ({ trade: t, entry: m.get(t.id) ?? null }));
  }, [trades, mine]);
  const filtered = useMemo(() => filterJournal(rows, filter), [rows, filter]);
  const setups = useMemo(() => [...new Set(mine.map((j) => j.setup.trim()).filter(Boolean))].sort(), [mine]);
  const tags = useMemo(() => [...new Set([...MISTAKE_TAGS, ...mine.flatMap((j) => j.tags)])], [mine]);
  const coach = useMemo(() => ruleBasedCoach(trades, mine), [trades, mine]);

  // deep link ?trade=p3 opens the editor
  const deepLink = params.get("trade");
  useEffect(() => {
    if (!deepLink) return;
    const t = trades.find((x) => x.id === deepLink);
    if (t) setEditing(t);
  }, [deepLink, trades]);

  if (loading) return <Skeleton className="h-[500px] w-full" />;
  if (!state || !accountId) {
    return (
      <Card>
        <EmptyState title="No paper account yet" description="Create a simulated account first; closed trades can then be journaled here." action={<ButtonLink href="/trade-lab" size="sm">Open terminal</ButtonLink>} icon={<NotebookPen className="h-5 w-5" />} />
      </Card>
    );
  }

  const cols: Column<JournalRow>[] = [
    { key: "id", header: "Trade", value: (r) => r.trade.id, cell: (r) => <span className="font-mono text-xs text-fg">{r.trade.id.toUpperCase()}</span> },
    { key: "date", header: "Closed", value: (r) => r.trade.closedAt, cell: (r) => <span className="text-fg-muted">{formatDate(r.trade.closedAt)}</span> },
    { key: "pnl", header: "Result", align: "right", value: (r) => r.trade.netPnl, cell: (r) => <PnL value={r.trade.netPnl} /> },
    { key: "r", header: "R", align: "right", value: (r) => r.trade.rMultiple, cell: (r) => (r.trade.rMultiple !== null ? `${r.trade.rMultiple.toFixed(2)}R` : "—") },
    { key: "setup", header: "Setup", hideBelow: "sm", value: (r) => r.entry?.setup ?? "", cell: (r) => <span className="text-xs">{r.entry?.setup || <span className="text-fg-muted">—</span>}</span> },
    {
      key: "tags",
      header: "Tags",
      hideBelow: "md",
      cell: (r) => (
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {(r.entry?.tags ?? []).slice(0, 4).map((t) => (
            <Badge key={t} tone={tagTone(t)}>
              {t.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: "lesson", header: "Lesson", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 max-w-[240px] text-2xs text-fg-muted">{r.entry?.lesson}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="xs" variant={r.entry ? "ghost" : "outline"} onClick={() => setEditing(r.trade)}>
          <Pencil className="h-3 w-3" /> {r.entry ? "Edit" : "Journal"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-fg">Trade journal</h2>
        <SimTag />
        <span className="text-2xs text-fg-muted">Private — never shared or shown on leaderboards.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <Card>
            <CardHeader title="Closed trades" subtitle={`${coach.journaled} of ${coach.trades} journaled`} />
            <CardBody className="space-y-3 pb-2">
              <FilterBar filter={filter} setFilter={setFilter} setups={setups} tags={tags} />
            </CardBody>
            <div className="pb-2">
              <DataTable
                rows={filtered}
                columns={cols}
                rowKey={(r) => r.trade.id}
                empty={{ title: trades.length ? "No trades match these filters" : "No closed trades yet", description: trades.length ? "Clear filters to see all trades." : "Close a simulated position to journal it." }}
              />
            </div>
          </Card>
          <AiCoachPanel trades={trades} entries={mine} coach={coach} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <RuleCoachPanel coach={coach} />
        </div>
      </div>
      <PaperNotice />
      {editing && (
        <JournalEditor
          trade={editing}
          entry={mine.find((j) => j.tradeId === editing.id) ?? null}
          accountId={accountId}
          onClose={() => {
            setEditing(null);
            if (deepLink) router.replace("/trade-lab/journal");
          }}
          onSave={saveJournal}
          onRemove={removeJournal}
        />
      )}
    </div>
  );
}

function FilterBar({ filter, setFilter, setups, tags }: { filter: JournalFilter; setFilter: (f: JournalFilter) => void; setups: string[]; tags: string[] }) {
  const upd = (p: Partial<JournalFilter>) => setFilter({ ...filter, ...p });
  const dateVal = (t?: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <label className="relative col-span-2">
        <span className="sr-only">Search journal</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <input className="input h-8 pl-8 text-xs" placeholder="Search reason, setup, lesson, tag…" value={filter.q ?? ""} onChange={(e) => upd({ q: e.target.value })} />
      </label>
      <select aria-label="Result" className="select h-8 text-xs" value={filter.result ?? "all"} onChange={(e) => upd({ result: e.target.value as JournalFilter["result"] })}>
        <option value="all">All results</option>
        <option value="win">Winners</option>
        <option value="loss">Losers</option>
      </select>
      <select aria-label="Setup" className="select h-8 text-xs" value={filter.setup ?? ""} onChange={(e) => upd({ setup: e.target.value || undefined })}>
        <option value="">Any setup</option>
        {setups.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Tag" className="select h-8 text-xs" value={filter.tag ?? ""} onChange={(e) => upd({ tag: e.target.value || undefined })}>
        <option value="">Any tag</option>
        {tags.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <select aria-label="Regime" className="select h-8 text-xs" value={filter.regime ?? ""} onChange={(e) => upd({ regime: e.target.value || undefined })}>
        <option value="">Any regime</option>
        {REGIME_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input aria-label="From date" type="date" className="input h-8 text-xs" value={dateVal(filter.from)} onChange={(e) => upd({ from: e.target.value ? Date.parse(e.target.value) : null })} />
      <input aria-label="To date" type="date" className="input h-8 text-xs" value={dateVal(filter.to)} onChange={(e) => upd({ to: e.target.value ? Date.parse(e.target.value) + 86_399_999 : null })} />
      <div className="col-span-2 flex flex-wrap items-center gap-3 text-xs text-fg-secondary md:col-span-4">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={!!filter.onlyMistakes} onChange={(e) => upd({ onlyMistakes: e.target.checked })} /> Mistakes only
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={!!filter.onlyWithLesson} onChange={(e) => upd({ onlyWithLesson: e.target.checked })} /> With a lesson
        </label>
        <button type="button" className="ml-auto text-2xs text-accent hover:underline" onClick={() => setFilter({ result: "all" })}>
          Clear filters
        </button>
      </div>
    </div>
  );
}

function JournalEditor({
  trade,
  entry,
  accountId,
  onClose,
  onSave,
  onRemove,
}: {
  trade: ClosedTrade;
  entry: JournalEntry | null;
  accountId: string;
  onClose: () => void;
  onSave: (e: JournalEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const toast = useToast();
  const [e, setE] = useState<JournalEntry>(() => entry ?? emptyJournal(uid(), accountId, trade, Date.now()));
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof JournalEntry>(k: K, v: JournalEntry[K]) => setE((x) => ({ ...x, [k]: v }));
  const toggle = (t: string) => set("tags", e.tags.includes(t) ? e.tags.filter((x) => x !== t) : [...e.tags, t]);
  const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      await onSave({ ...e, updatedAt: Date.now() });
      toast({ tone: "success", title: "Journal entry saved" });
      onClose();
    } catch (err) {
      toast({ tone: "danger", title: "Could not save", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  const plannedTargetResult = e.plannedTarget && trade.qty ? (e.plannedTarget - trade.avgEntry) * trade.qty : null;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          Journal · {trade.id.toUpperCase()} <SimTag />
        </span>
      }
      description={`${formatDateTime(trade.openedAt, undefined, false)} → ${formatDateTime(trade.closedAt, undefined, false)} · held ${formatDuration(trade.holdingMs)}`}
      footer={
        <>
          {entry && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-danger"
              onClick={async () => {
                await onRemove(entry.id);
                onClose();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete entry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={busy}>
            Save entry
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Setup" htmlFor="j-setup">
              <input id="j-setup" className="input" maxLength={120} value={e.setup} onChange={(x) => set("setup", x.target.value)} placeholder="e.g. Breakout retest" />
            </Field>
            <Field label="Market regime" htmlFor="j-regime">
              <select id="j-regime" className="select" value={e.regime} onChange={(x) => set("regime", x.target.value)}>
                <option value="">—</option>
                {REGIME_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Reason for entry" htmlFor="j-reason">
            <textarea id="j-reason" className="input h-20 py-2" maxLength={600} value={e.reasonForEntry} onChange={(x) => set("reasonForEntry", x.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Planned risk ($)" htmlFor="j-risk">
              <NumInput id="j-risk" value={e.plannedRisk === null ? "" : String(e.plannedRisk)} onChange={(v) => set("plannedRisk", numOrNull(v))} />
            </Field>
            <Field label="Planned stop" htmlFor="j-stop">
              <NumInput id="j-stop" value={e.plannedStop === null ? "" : String(e.plannedStop)} onChange={(v) => set("plannedStop", numOrNull(v))} />
            </Field>
            <Field label="Planned target" htmlFor="j-target">
              <NumInput id="j-target" value={e.plannedTarget === null ? "" : String(e.plannedTarget)} onChange={(v) => set("plannedTarget", numOrNull(v))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emotion" htmlFor="j-emotion">
              <select id="j-emotion" className="select" value={e.emotion} onChange={(x) => set("emotion", x.target.value)}>
                <option value="">—</option>
                {EMOTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-secondary">Confidence (1–5)</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Confidence">
                {[1, 2, 3, 4, 5].map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={e.confidence === c}
                    onClick={() => set("confidence", e.confidence === c ? null : c)}
                    className={cn("h-10 flex-1 rounded-lg border text-sm font-medium", e.confidence === c ? "border-accent bg-accent/10 text-fg" : "border-border-subtle text-fg-muted hover:text-fg")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Field label="Exit reason" htmlFor="j-exit">
            <input id="j-exit" className="input" maxLength={300} value={e.exitReason} onChange={(x) => set("exitReason", x.target.value)} />
          </Field>
          <Field label="Lesson" htmlFor="j-lesson">
            <textarea id="j-lesson" className="input h-20 py-2" maxLength={600} value={e.lesson} onChange={(x) => set("lesson", x.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-secondary">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...MISTAKE_TAGS, ...e.tags])].map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={e.tags.includes(t)}
                  onClick={() => toggle(t)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-2xs font-semibold tracking-wide transition-colors",
                    e.tags.includes(t) ? (NEGATIVE_TAGS.includes(t) ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success") : "border-border-subtle text-fg-muted hover:text-fg",
                  )}
                >
                  {t.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(x) => {
                x.preventDefault();
                const t = normalizeTag(custom);
                if (t && !e.tags.includes(t)) set("tags", [...e.tags, t]);
                setCustom("");
              }}
            >
              <input className="input h-8 text-xs" placeholder="Custom tag" value={custom} onChange={(x) => setCustom(x.target.value)} aria-label="Custom tag" />
              <Button size="xs" variant="outline" type="submit">
                Add
              </Button>
            </form>
          </div>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 p-3">
            <p className="label mb-1">Trade review — planned vs actual</p>
            <KV label="Planned entry" value={px(trade.plannedEntry)} />
            <KV label="Actual entry" value={px(trade.avgEntry)} />
            <KV label="Planned stop" value={px(e.plannedStop)} />
            <KV label="Actual exit" value={px(trade.avgExit)} />
            <KV label="Planned target" value={px(e.plannedTarget)} />
            <KV label="Target result (gross)" value={usd(plannedTargetResult)} />
            <KV label="Actual result (net)" value={<PnL value={trade.netPnl} pctValue={trade.returnPct} />} />
            <KV label="Planned risk" value={usd(e.plannedRisk)} />
            <KV label="Actual initial risk" value={trade.initialRisk !== null ? usd(trade.initialRisk) : "No stop"} />
            <KV label="R-multiple" value={trade.rMultiple !== null ? `${trade.rMultiple.toFixed(2)}R` : "—"} />
            <KV label="Slippage" value={usd(trade.slippageCost, 4)} />
            <KV label="Fees" value={usd(trade.fees, 4)} />
          </div>
          <p className="text-2xs text-fg-muted">Journal entries are private. The AI coach only receives them when you explicitly run an analysis.</p>
        </div>
      </div>
    </Modal>
  );
}

function RuleCoachPanel({ coach }: { coach: RuleCoachSummary }) {
  return (
    <Card>
      <CardHeader title="Rule-based coach" icon={<Brain className="h-4 w-4" />} subtitle="Deterministic analysis of your own simulated record — always available." />
      <CardBody className="space-y-4 pt-2">
        <ul className="space-y-2">
          {coach.findings.map((f) => (
            <li key={f.text} className={cn("rounded-lg border px-2.5 py-2 text-xs leading-relaxed", f.tone === "warning" ? "border-warning/30 bg-warning/5 text-fg-secondary" : f.tone === "positive" ? "border-success/30 bg-success/5 text-fg-secondary" : "border-border-subtle text-fg-secondary")}>
              {f.text}
            </li>
          ))}
        </ul>
        <div>
          <p className="label mb-1">Exit mix</p>
          <KV label="Stop-loss" value={coach.exitMix.stopLoss} />
          <KV label="Take-profit" value={coach.exitMix.takeProfit} />
          <KV label="Manual / other" value={coach.exitMix.manual} />
          <KV label="Trades without stop" value={coach.noStopPct !== null ? pct(coach.noStopPct, 0, false) : "—"} />
          <KV label="Loss rate after FOMO" value={coach.lossRateAfterFomo !== null ? pct(coach.lossRateAfterFomo, 0, false) : "—"} />
          <KV label="Largest loss share" value={coach.largestLossShare !== null ? pct(coach.largestLossShare, 0, false) : "—"} tip="Share of all losses from the single worst trade (risk concentration)." />
        </div>
        {coach.tagStats.length > 0 && (
          <div>
            <p className="label mb-1">By tag</p>
            <GroupTable rows={coach.tagStats} />
          </div>
        )}
        {coach.setupStats.length > 0 && (
          <div>
            <p className="label mb-1">By setup (avg R)</p>
            <GroupTable rows={coach.setupStats} />
          </div>
        )}
        {coach.questions.length > 0 && (
          <div>
            <p className="label mb-1">Questions for review</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-fg-secondary">
              {coach.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function GroupTable({ rows }: { rows: RuleCoachSummary["tagStats"] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-fg-muted">
          <th className="py-1 text-left font-medium">Group</th>
          <th className="py-1 text-right font-medium">n</th>
          <th className="py-1 text-right font-medium">Win %</th>
          <th className="py-1 text-right font-medium">Avg R</th>
          <th className="py-1 text-right font-medium">Net</th>
        </tr>
      </thead>
      <tbody className="num">
        {rows.slice(0, 8).map((g) => (
          <tr key={g.key} className="border-t border-border-subtle/60">
            <td className="max-w-[120px] truncate py-1 text-fg-secondary">{g.key.replace(/_/g, " ")}</td>
            <td className="py-1 text-right">{g.count}</td>
            <td className="py-1 text-right">{g.winRate.toFixed(0)}%</td>
            <td className="py-1 text-right">{g.avgR !== null ? g.avgR.toFixed(2) : "—"}</td>
            <td className="py-1 text-right">
              <PnL value={g.netPnl} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface CoachResponse {
  analysis: { patterns: string[]; mistakes: string[]; strengths: string[]; consistency: string; riskConcentration: string; questions: string[] };
  model: string;
  generatedAt: number;
  tradesAnalysed: number;
}

function AiCoachPanel({ trades, entries, coach }: { trades: ClosedTrade[]; entries: JournalEntry[]; coach: RuleCoachSummary }) {
  const cfg = useApi<{ configured: boolean }>("/api/tradelab/coach", { staleMs: 5 * 60_000 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<CoachResponse | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const last = trades.slice(-200);
      const ids = new Set(last.map((t) => t.id));
      const s = tradeStats(last, 1, 1);
      const stats: Record<string, number | null> = {
        trades: s.totalTrades,
        wins: s.wins,
        losses: s.losses,
        winRatePct: s.winRate,
        avgWin: s.avgWin,
        avgLoss: s.avgLoss,
        profitFactor: s.profitFactor !== null && Number.isFinite(s.profitFactor) ? s.profitFactor : null,
        largestWin: s.largestWin,
        largestLoss: s.largestLoss,
        avgR: s.avgR,
        tradesWithStop: s.tradesWithR,
        avgHoldingHours: s.avgHoldingMs !== null ? s.avgHoldingMs / 3_600_000 : null,
        netPnl: s.netPnl,
        totalFees: s.totalFees,
        maxConsecutiveLosses: s.maxConsecutiveLosses,
        journalCoveragePct: coach.coveragePct,
        noStopPct: coach.noStopPct,
        lossRateAfterFomoPct: coach.lossRateAfterFomo,
        riskSizeCv: coach.riskCv,
        largestLossSharePct: coach.largestLossShare,
      };
      const body = {
        stats,
        ruleFindings: coach.findings.map((f) => f.text),
        trades: last.map((t) => ({
          id: t.id,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          holdingMs: t.holdingMs,
          netPnl: t.netPnl,
          returnPct: t.returnPct,
          rMultiple: t.rMultiple,
          initialRisk: t.initialRisk,
          fees: t.fees,
          hadStop: t.initialStop !== null,
          exit: t.exitRoles.join("+") || "EXIT",
        })),
        journal: entries
          .filter((j) => ids.has(j.tradeId))
          .map((j) => ({ tradeId: j.tradeId, setup: j.setup, regime: j.regime, emotion: j.emotion, confidence: j.confidence, tags: j.tags.slice(0, 20), reasonForEntry: j.reasonForEntry, exitReason: j.exitReason, lesson: j.lesson })),
      };
      setRes(await apiPost<CoachResponse>("/api/tradelab/coach", body));
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : "AI coach unavailable");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="AI trade coach"
        icon={<Sparkles className="h-4 w-4" />}
        subtitle="Explains patterns in your own simulated trades and journal. Never gives buy/sell instructions."
        actions={res ? <TrustBadge kind="MODEL" /> : undefined}
      />
      <CardBody className="pt-2">
        {cfg.loading && !cfg.data ? (
          <SkeletonRows rows={3} />
        ) : cfg.error && !cfg.data ? (
          <ErrorState compact message={cfg.error.message} onRetry={cfg.reload} />
        ) : !cfg.data?.configured ? (
          <NotConnected what="The AI coach needs an AI provider (ANTHROPIC_API_KEY) on the server." how="The rule-based coach on this page always works without it." className="py-6" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={run} loading={busy} disabled={!trades.length}>
                <Sparkles className="h-3.5 w-3.5" /> Analyse my simulated trades
              </Button>
              <span className="text-2xs text-fg-muted">Sends only computed stats, your closed trades and journal text. No market data is added.</span>
            </div>
            {err && <p className="text-xs text-danger">{err}</p>}
            {res && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AiList title="Patterns" items={res.analysis.patterns} />
                <AiList title="Repeated mistakes" items={res.analysis.mistakes} />
                <AiList title="Strengths" items={res.analysis.strengths} />
                <AiList title="Questions for review" items={res.analysis.questions} />
                <div className="sm:col-span-2 space-y-2 text-xs text-fg-secondary">
                  {res.analysis.consistency && (
                    <p>
                      <span className="label mr-1">Consistency</span>
                      {res.analysis.consistency}
                    </p>
                  )}
                  {res.analysis.riskConcentration && (
                    <p>
                      <span className="label mr-1">Risk concentration</span>
                      {res.analysis.riskConcentration}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardBody>
      {res && (
        <CardFooter>
          <span>
            Model {res.model} · {formatDateTime(res.generatedAt)} · {res.tradesAnalysed} trades
          </span>
          <span>AI output — verify against your statistics</span>
        </CardFooter>
      )}
    </Card>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border-subtle p-2.5">
      <p className="label mb-1">{title}</p>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-fg-secondary">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-muted">Nothing noted.</p>
      )}
    </div>
  );
}
