"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { TrustBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Sparkline } from "@/components/charts/Sparkline";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/format";
import { openOrders, replayEvents, summarize } from "@/lib/tradelab/engine";
import { getTradeLabRepo } from "@/lib/tradelab/repo";
import type { AccountState } from "@/lib/tradelab/types";

/**
 * Dashboard widget: SIMULATED Trade Lab account snapshot (equity, P&L, open positions).
 * Reads the paper ledger (guest storage or Supabase) and marks it to the live XRP price.
 */
export function TradeLabSnapshotWidget({ className }: { className?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { ticker } = useMarket();
  const [state, setState] = useState<AccountState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const repo = getTradeLabRepo(user?.id ?? null);
        const [accounts, active] = await Promise.all([repo.listAccounts(), repo.getActiveAccountId()]);
        const id = accounts.find((a) => a.id === active)?.id ?? accounts[accounts.length - 1]?.id;
        if (!id) {
          if (!cancelled) setStatus("empty");
          return;
        }
        const st = replayEvents(id, await repo.loadEvents(id));
        if (cancelled) return;
        setState(st.initialized ? st : null);
        setStatus(st.initialized ? "ready" : "empty");
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load paper account");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, nonce]);

  const sum = useMemo(() => (state ? summarize(state, ticker?.price ?? null, Date.now()) : null), [state, ticker?.price]);
  const spark = useMemo(() => (state ? state.equityCurve.slice(-60).map((p) => p.equity) : []), [state]);

  return (
    <Card className={className}>
      <CardHeader
        title="Trade Lab"
        icon={<FlaskConical className="h-4 w-4" />}
        subtitle={state ? state.name : "Paper trading"}
        actions={
          <div className="flex items-center gap-2">
            <TrustBadge kind="SIMULATED" />
            <Link href="/trade-lab" className="text-2xs font-medium text-accent hover:underline">
              Open →
            </Link>
          </div>
        }
      />
      <CardBody>
        {status === "loading" ? (
          <SkeletonRows rows={4} />
        ) : status === "error" ? (
          <ErrorState compact message={err ?? undefined} onRetry={() => setNonce((n) => n + 1)} />
        ) : status === "empty" || !sum || !state ? (
          <EmptyState
            className="py-6"
            title="No paper account yet"
            description="Practice with virtual capital against live XRP prices. Simulated only."
            action={
              <ButtonLink href="/trade-lab" size="sm">
                Start paper trading
              </ButtonLink>
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label">Virtual equity</p>
                <p className="num text-2xl font-semibold text-fg">{formatMoney(sum.equity)}</p>
                <p className={`num text-sm ${sum.netPnl > 0 ? "text-success" : sum.netPnl < 0 ? "text-danger" : "text-fg-secondary"}`}>
                  {formatSignedMoney(sum.netPnl)} ({formatPct(sum.returnPct)})
                </p>
              </div>
              {spark.length > 1 && <Sparkline values={spark} width={110} height={40} />}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border-subtle p-2">
                <dt className="label">Open positions</dt>
                <dd className="num mt-0.5 font-semibold text-fg">{state.position ? 1 : 0}</dd>
              </div>
              <div className="rounded-lg border border-border-subtle p-2">
                <dt className="label">Open orders</dt>
                <dd className="num mt-0.5 font-semibold text-fg">{openOrders(state).length}</dd>
              </div>
              <div className="rounded-lg border border-border-subtle p-2">
                <dt className="label">Unrealized</dt>
                <dd className={`num mt-0.5 font-semibold ${sum.unrealizedPnl > 0 ? "text-success" : sum.unrealizedPnl < 0 ? "text-danger" : "text-fg"}`}>{formatSignedMoney(sum.unrealizedPnl)}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardBody>
      <CardFooter>
        <span>Virtual capital · no real orders</span>
        {sum && <span>Max DD {formatPct(-sum.maxDrawdownPct)}</span>}
      </CardFooter>
    </Card>
  );
}
