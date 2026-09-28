"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, Flag, Medal, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Switch } from "@/components/ui/Misc";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiPost, useApi } from "@/hooks/useApi";
import { isSupabaseConfigured } from "@/lib/config";
import { formatDate, formatDateTime } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { CHALLENGES, LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_TRADES, computeChallenge, type ChallengeProgress } from "@/lib/tradelab/challenges";
import { PaperNotice, ProgressBar, SimTag, pct } from "./common";
import { useTradeLab } from "./TradeLabProvider";

const STATUS: Record<ChallengeProgress["status"], { label: string; tone: "neutral" | "accent" | "success" | "danger" }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "accent" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function ChallengesView() {
  const { state, journal, accountId, replaySessions, challenges, startChallenge, abandonChallenge } = useTradeLab();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const data = useMemo(
    () => ({
      trades: state?.trades ?? [],
      equityCurve: state?.equityCurve ?? [],
      journal: journal.filter((j) => j.accountId === accountId),
      replaySessions,
      startingCapital: state ? Number(state.startingCapital) : 0,
      now,
    }),
    [state, journal, accountId, replaySessions, now],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-fg">Challenges</h2>
        <SimTag />
        <span className="text-2xs text-fg-muted">Practice goals measured on your own simulated data. No prizes, no real money.</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {CHALLENGES.map((def) => {
          const enr = challenges.find((c) => c.id === def.id) ?? null;
          const p = computeChallenge(def.id, enr, data);
          const st = STATUS[p.status];
          const needsAccount = def.id !== "REPLAY" && !state;
          return (
            <Card key={def.id} className="flex flex-col">
              <CardHeader
                title={def.title}
                icon={def.id === "LOW_DRAWDOWN" ? <Medal className="h-4 w-4" /> : def.id === "REPLAY" ? <Flag className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                subtitle={def.summary}
                actions={<Badge tone={st.tone}>{st.label}</Badge>}
              />
              <CardBody className="flex-1 space-y-3">
                <ul className="space-y-1 text-xs text-fg-secondary">
                  {def.rules.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-muted" />
                      {r}
                    </li>
                  ))}
                </ul>
                {enr && (
                  <>
                    <ProgressBar value={p.progressPct} tone={p.status === "FAILED" ? "danger" : p.status === "COMPLETED" ? "success" : "accent"} label={`${def.title} progress`} />
                    <div className="grid grid-cols-2 gap-2">
                      {p.metrics.map((m) => (
                        <div key={m.label} className="rounded-lg border border-border-subtle px-2.5 py-2">
                          <p className="label">{m.label}</p>
                          <p className="num mt-0.5 flex items-center gap-1 text-sm font-semibold text-fg">
                            {m.ok ? <CircleCheck className="h-3.5 w-3.5 text-success" /> : <CircleX className="h-3.5 w-3.5 text-fg-muted" />}
                            {m.value} <span className="text-2xs font-normal text-fg-muted">/ {m.target}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-2xs text-fg-muted">
                      Started {formatDateTime(enr.startedAt, undefined, false)} · {p.note}
                    </p>
                  </>
                )}
              </CardBody>
              <CardFooter>
                {enr ? (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => abandonChallenge(def.id)}>
                      Abandon
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => startChallenge({ id: def.id, startedAt: Date.now(), accountId }).then(() => toast({ title: `${def.title} restarted` }))}
                    >
                      Restart
                    </Button>
                  </>
                ) : (
                  <>
                    <span>{needsAccount ? "Create a paper account first" : "Progress counts from the moment you start"}</span>
                    <Button size="xs" disabled={needsAccount} onClick={() => startChallenge({ id: def.id, startedAt: Date.now(), accountId }).then(() => toast({ tone: "success", title: `${def.title} started` }))}>
                      Start challenge
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <Leaderboard />
      <PaperNotice />
    </div>
  );
}

interface LeaderboardEntry {
  display_alias: string;
  trade_count: number;
  period_days: number;
  return_pct: number | null;
  max_drawdown_pct: number | null;
  return_to_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  consistency_pct: number | null;
  computed_at: string;
}

function Leaderboard() {
  const q = useApi<{ configured: boolean; entries: LeaderboardEntry[]; minTrades: number; minDays: number }>("/api/tradelab/leaderboard", { staleMs: 60_000 });
  const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const cols: Column<LeaderboardEntry>[] = [
    { key: "alias", header: "Alias", value: (e) => e.display_alias, cell: (e) => <span className="font-medium text-fg">{e.display_alias}</span> },
    { key: "ret", header: "Return", align: "right", value: (e) => n(e.return_pct), cell: (e) => pct(n(e.return_pct)) },
    { key: "rdd", header: "Return / max DD", align: "right", value: (e) => n(e.return_to_drawdown), cell: (e) => (e.return_to_drawdown !== null ? Number(e.return_to_drawdown).toFixed(2) : "—") },
    { key: "dd", header: "Max DD", align: "right", value: (e) => n(e.max_drawdown_pct), cell: (e) => pct(e.max_drawdown_pct !== null ? -Number(e.max_drawdown_pct) : null) },
    { key: "cons", header: "Consistency", align: "right", hideBelow: "sm", value: (e) => n(e.consistency_pct), cell: (e) => pct(n(e.consistency_pct), 0, false) },
    { key: "wr", header: "Win rate", align: "right", hideBelow: "md", value: (e) => n(e.win_rate), cell: (e) => pct(n(e.win_rate), 0, false) },
    { key: "n", header: "Trades", align: "right", value: (e) => e.trade_count, cell: (e) => e.trade_count },
    { key: "days", header: "Days", align: "right", hideBelow: "md", value: (e) => e.period_days, cell: (e) => e.period_days },
    { key: "at", header: "Computed", hideBelow: "lg", value: (e) => e.computed_at, cell: (e) => <span className="text-2xs text-fg-muted">{formatDate(e.computed_at)}</span> },
  ];
  return (
    <Card>
      <CardHeader
        title="Paper leaderboard"
        icon={<Users className="h-4 w-4" />}
        subtitle={`Opt-in only · SIMULATED results · minimum ${LEADERBOARD_MIN_TRADES} closed trades and ${LEADERBOARD_MIN_DAYS} days`}
        actions={<TrustBadge kind="SIMULATED" />}
      />
      <div className="pb-2">
        {q.loading && !q.data ? (
          <SkeletonRows rows={4} className="p-4" />
        ) : q.error && !q.data ? (
          <ErrorState compact message={q.error.message} onRetry={q.reload} lastUpdated={q.updatedAt} />
        ) : !q.data?.entries.length ? (
          <EmptyState
            title="No leaderboard entries yet"
            description={
              q.data?.configured
                ? `Entries appear once opted-in users reach ${LEADERBOARD_MIN_TRADES} simulated trades over at least ${LEADERBOARD_MIN_DAYS} days.`
                : "The leaderboard requires user accounts, which are not enabled on this deployment. Entries are never invented."
            }
            icon={<Trophy className="h-5 w-5" />}
          />
        ) : (
          <DataTable rows={q.data.entries} columns={cols} rowKey={(e) => e.display_alias} initialSort={{ key: "rdd", dir: "desc" }} />
        )}
      </div>
      <CardBody className="border-t border-border-subtle pt-3">
        <OptIn />
      </CardBody>
      <CardFooter>
        <span>Simulated paper results. Not evidence of real trading skill or future results — no &quot;guaranteed profitable trader&quot; claims.</span>
      </CardFooter>
    </Card>
  );
}

function OptIn() {
  const { user, enabled } = useAuth();
  const { accountId, repoKind } = useTradeLab();
  const toast = useToast();
  const [alias, setAlias] = useState("");
  const [opted, setOpted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const sb = user && enabled && isSupabaseConfigured() ? getSupabaseBrowser() : null;

  useEffect(() => {
    if (!sb || !user) return;
    sb.from("paper_leaderboard_optin")
      .select("display_alias,opted_in")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as { display_alias: string; opted_in: boolean } | null;
        if (d) {
          setAlias(d.display_alias);
          setOpted(d.opted_in);
        }
        setLoaded(true);
      });
  }, [sb, user]);

  if (!enabled) return <p className="text-xs text-fg-muted">Leaderboard opt-in requires accounts, which are not enabled on this deployment.</p>;
  if (!user || !sb || repoKind !== "supabase") return <p className="text-xs text-fg-muted">Sign in to opt in. Guest-mode data stays in this browser and is never published.</p>;

  const save = async (next: boolean) => {
    const a = alias.trim();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(a)) {
      toast({ tone: "warning", title: "Choose an alias", description: "3–30 characters: letters, digits, _ . -" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.from("paper_leaderboard_optin").upsert({ user_id: user.id, display_alias: a, opted_in: next, account_id: accountId });
      if (error) throw new Error(error.message.includes("duplicate") ? "Alias already taken" : error.message);
      setOpted(next);
      if (next && accountId) {
        const r = await apiPost<{ eligible: boolean }>("/api/tradelab/leaderboard", { accountId });
        toast({ tone: "success", title: "Opted in", description: r.eligible ? "Your aggregated simulated stats are listed." : `Listed once you reach ${LEADERBOARD_MIN_TRADES} trades over ${LEADERBOARD_MIN_DAYS} days.` });
      } else toast({ title: next ? "Opted in" : "Opted out — your entry is hidden" });
    } catch (e) {
      toast({ tone: "danger", title: "Could not update opt-in", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end", !loaded && "opacity-60")}>
      <Field label="Public alias (no real name)" htmlFor="lb-alias" className="flex-1">
        <input id="lb-alias" className="input h-9" value={alias} maxLength={30} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. calm_trader_42" />
      </Field>
      <div className="flex items-center gap-2 text-xs text-fg-secondary">
        <Switch checked={opted} onChange={(v) => save(v)} label="Show my aggregated simulated stats" disabled={busy || !loaded} />
        Show my aggregated stats
      </div>
      {opted && (
        <Button size="sm" variant="outline" loading={busy} onClick={() => save(true)}>
          Recompute my stats
        </Button>
      )}
      <p className="text-2xs text-fg-muted sm:max-w-xs">Only aggregates are published (return, drawdown, win rate, consistency). Journal, orders and balances stay private. Stats are recomputed server-side from your ledger.</p>
    </div>
  );
}
