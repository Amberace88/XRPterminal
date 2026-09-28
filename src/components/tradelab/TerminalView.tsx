"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, NotebookPen, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Modal";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import type { Side } from "@/lib/tradelab/types";
import { AccountStrip, ActivityTabs } from "./AccountPanels";
import { LiveChart } from "./LiveChart";
import { Onboarding } from "./Onboarding";
import { OrderTicket } from "./OrderTicket";
import { PositionSizer } from "./PositionSizer";
import { AssumptionsCard, RiskSettingsCard } from "./RiskSettings";
import { PaperNotice, PnL, SimTag, px } from "./common";
import { useTradeLab } from "./TradeLabProvider";

function RecentTrades() {
  const { state, journal } = useTradeLab();
  const trades = (state?.trades ?? []).slice(-6).reverse();
  const done = new Set(journal.map((j) => j.tradeId));
  if (!trades.length) return <EmptyState title="No closed trades yet" description="Closed simulated trades appear here so you can journal them." icon={<NotebookPen className="h-5 w-5" />} />;
  return (
    <ul className="divide-y divide-border-subtle/60 px-4 sm:px-5">
      {trades.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium text-fg">
              {t.id.toUpperCase()} · {px(t.avgEntry)} → {px(t.avgExit)}
            </p>
            <p className="text-fg-muted">{formatDateTime(t.closedAt, undefined, false)}</p>
          </div>
          <div className="flex items-center gap-3">
            <PnL value={t.netPnl} />
            <Link href={`/trade-lab/journal?trade=${t.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
              {done.has(t.id) ? "Review" : "Journal"} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** /trade-lab — the SIMULATED trading terminal. */
export function TerminalView() {
  const tl = useTradeLab();
  const toast = useToast();
  const [newAccount, setNewAccount] = useState(false);
  const [sheet, setSheet] = useState<Side | null>(null);
  const now = useCallback(() => Date.now(), []);

  if (tl.loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-[480px] lg:col-span-8" />
          <Skeleton className="h-[480px] lg:col-span-4" />
        </div>
      </div>
    );
  }
  if (!tl.state || newAccount) return <Onboarding onCancel={tl.state ? () => setNewAccount(false) : undefined} />;

  const state = tl.state;
  const close = () => {
    const r = tl.closePosition();
    if (r?.rejection) toast({ tone: "danger", title: "Close rejected", description: r.rejection.reason });
    else if (r) toast({ tone: "success", title: "Simulated position closed" });
  };
  const cancel = (id: string) => {
    tl.cancelOrder(id);
    toast({ title: "Simulated order cancelled" });
  };
  const ticket = (hotkeys: boolean, initialSide?: Side, onDone?: () => void) => (
    <OrderTicket state={state} snapshot={tl.snapshot} now={now} onPlace={tl.placeOrder} hotkeys={hotkeys} initialSide={initialSide} onDone={onDone} />
  );

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <AccountStrip summary={tl.summary} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <LiveChart state={state} />
          <Card>
            <ActivityTabs state={state} summary={tl.summary} onCancel={cancel} onClose={close} extraTab={{ label: "Journal", node: <RecentTrades /> }} />
          </Card>
        </div>
        <aside className="space-y-4 lg:col-span-4">
          <Card className="hidden lg:block">
            <CardHeader title="Order ticket" subtitle="Simulated execution against the captured quote" actions={<SimTag />} />
            <CardBody className="pt-3">{ticket(true)}</CardBody>
          </Card>
          <RiskSettingsCard state={state} onSave={tl.updateSettings} onReset={tl.resetAccount} />
          <PositionSizer equity={tl.summary?.equity ?? null} price={tl.snapshot?.price ?? null} defaultRiskPct={state.settings.risk.maxRiskPct || 1} />
          <AssumptionsCard settings={state.settings} />
          {tl.accounts.length < tl.maxAccounts && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setNewAccount(true)}>
              <Plus className="h-3.5 w-3.5" /> New paper account
            </Button>
          )}
        </aside>
      </div>
      <PaperNotice />

      {/* Mobile: sticky compact ticket bar above the bottom navigation → bottom sheet */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-30 border-t border-border-subtle bg-bg/95 px-3 py-2 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="num text-sm font-semibold text-fg">{px(tl.snapshot?.price ?? null)}</p>
            <p className="truncate text-2xs text-fg-muted">
              <SimTag className="mr-1 scale-90" />
              Equity {tl.summary ? px(tl.summary.equity) : "—"}
            </p>
          </div>
          <Button variant="success" size="sm" onClick={() => setSheet("BUY")} aria-label="Open simulated buy ticket">
            Buy
          </Button>
          <Button variant="danger" size="sm" onClick={() => setSheet("SELL")} aria-label="Open simulated sell ticket" disabled={!state.position}>
            Sell
          </Button>
        </div>
      </div>
      <Drawer open={sheet !== null} onClose={() => setSheet(null)} side="bottom" title={<span className="flex items-center gap-2">Order ticket <SimTag /></span>}>
        <div className="p-4">{sheet && ticket(false, sheet, () => setSheet(null))}</div>
      </Drawer>
    </div>
  );
}
