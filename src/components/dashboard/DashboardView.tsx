"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BellPlus,
  Brain,
  Calculator,
  Eye,
  EyeOff,
  FlaskConical,
  LayoutGrid,
  Plug,
  RotateCcw,
  Search,
  Telescope,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Disclaimer } from "@/components/ui/Misc";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useT } from "@/hooks/useT";
import { cn } from "@/lib/utils/cn";
import { OnboardingTour } from "@/components/auth/Onboarding";
import { MarketOverviewWidget } from "@/components/widgets/MarketOverviewWidget";
import { RegimeWidget } from "@/components/widgets/RegimeWidget";
import { RiskWidget } from "@/components/widgets/RiskWidget";
import { MarketHealthWidget } from "@/components/widgets/MarketHealthWidget";
import { PortfolioSummaryWidget } from "@/components/widgets/PortfolioSummaryWidget";
import { WalletSummaryWidget } from "@/components/widgets/WalletSummaryWidget";
import { XrplActivityWidget } from "@/components/widgets/XrplActivityWidget";
import { WhalesWidget } from "@/components/widgets/WhalesWidget";
import { ExchangeFlowsWidget } from "@/components/widgets/ExchangeFlowsWidget";
import { NewsWidget } from "@/components/widgets/NewsWidget";
import { AiBriefWidget } from "@/components/widgets/AiBriefWidget";
import { AlertsWidget } from "@/components/widgets/AlertsWidget";
import { FutureScenariosWidget } from "@/components/widgets/FutureScenariosWidget";
import { WatchlistWidget } from "@/components/widgets/WatchlistWidget";
import { TradeLabSnapshotWidget } from "@/components/widgets/TradeLabSnapshotWidget";

/** Smart Money is intentionally not populated until the wallet-performance indexer exists (spec §32). */
function SmartMoneyWidget({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Smart money" subtitle="Wallets with proven, measurable track records" actions={<Badge tone="accent">Planned</Badge>} />
      <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
        <p>
          XRP Terminal never labels a wallet &ldquo;smart money&rdquo; because of its balance or a single profitable trade. The label will require realized
          performance, consistency, drawdown and a minimum sample of trades across time — which needs a historical XRPL trade indexer.
        </p>
        <p className="text-fg-secondary">Until that indexer is live, this panel stays empty rather than showing unsupported labels.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/xrpl/whales" className="text-accent hover:underline">
            Live whale transfers →
          </Link>
          <Link href="/social" className="text-accent hover:underline">
            Verified traders →
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

interface WidgetDef {
  id: string;
  title: string;
  span: string; // grid classes at lg
  render: (cls: string) => React.ReactNode;
}

const WIDGETS: WidgetDef[] = [
  { id: "market", title: "XRP market", span: "lg:col-span-5", render: (c) => <MarketOverviewWidget className={c} /> },
  { id: "portfolio", title: "Portfolio", span: "lg:col-span-4", render: (c) => <PortfolioSummaryWidget className={c} /> },
  { id: "alerts", title: "Alerts", span: "lg:col-span-3", render: (c) => <AlertsWidget className={c} /> },
  { id: "ai", title: "AI brief", span: "lg:col-span-5", render: (c) => <AiBriefWidget className={c} /> },
  { id: "regime", title: "Market regime", span: "lg:col-span-4", render: (c) => <RegimeWidget className={c} /> },
  { id: "risk", title: "Risk level", span: "lg:col-span-3", render: (c) => <RiskWidget className={c} /> },
  { id: "wallet", title: "Wallet", span: "lg:col-span-4", render: (c) => <WalletSummaryWidget className={c} /> },
  { id: "xrpl", title: "XRPL activity", span: "lg:col-span-4", render: (c) => <XrplActivityWidget className={c} /> },
  { id: "health", title: "Market health", span: "lg:col-span-4", render: (c) => <MarketHealthWidget className={c} /> },
  { id: "future", title: "Future scenarios", span: "lg:col-span-6", render: (c) => <FutureScenariosWidget className={c} /> },
  { id: "whales", title: "Whales", span: "lg:col-span-6", render: (c) => <WhalesWidget className={c} /> },
  { id: "flows", title: "Exchange flows", span: "lg:col-span-4", render: (c) => <ExchangeFlowsWidget className={c} /> },
  { id: "smart", title: "Smart money", span: "lg:col-span-4", render: (c) => <SmartMoneyWidget className={c} /> },
  { id: "tradelab", title: "Trade Lab", span: "lg:col-span-4", render: (c) => <TradeLabSnapshotWidget className={c} /> },
  { id: "news", title: "News", span: "lg:col-span-7", render: (c) => <NewsWidget className={c} /> },
  { id: "watchlist", title: "Watchlist", span: "lg:col-span-5", render: (c) => <WatchlistWidget className={c} /> },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);

const QUICK_ACTIONS = [
  { href: "/portfolio?connect=xrpl", label: "Connect Wallet", icon: Wallet },
  { href: "/portfolio?connect=exchange", label: "Add Exchange", icon: Plug },
  { href: "/trade-lab", label: "Open Trade Lab", icon: FlaskConical },
  { href: "/xrpl", label: "Search Wallet", icon: Search },
  { href: "/alerts?new=1", label: "Set Alert", icon: BellPlus },
  { href: "/calculators", label: "Run Calculator", icon: Calculator },
  { href: "/future", label: "View Future", icon: Telescope },
  { href: "/ai", label: "Open AI Brief", icon: Brain },
];

export function DashboardView() {
  const { prefs, setPref, hydrated } = usePreferences();
  const { user, isGuest } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState(false);

  const order = useMemo(() => {
    const saved = prefs.dashboardLayout.filter((id) => DEFAULT_ORDER.includes(id));
    return [...saved, ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
  }, [prefs.dashboardLayout]);
  const hidden = new Set(prefs.hiddenWidgets);

  const move = (id: string, dir: -1 | 1) => {
    const next = [...order];
    const i = next.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPref("dashboardLayout", next);
  };
  const toggle = (id: string) => {
    const s = new Set(prefs.hiddenWidgets);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setPref("hiddenWidgets", [...s]);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      {hydrated && <OnboardingTour />}
      <PageHeader
        title={t("nav.dashboard")}
        description={
          <>
            {greeting}
            {user?.email ? `, ${user.email.split("@")[0]}` : ""}. Your XRP command center — live market, ledger, portfolio and research in one view.
            {isGuest && <span className="ml-1 text-fg-muted">({t("common.guestMode")})</span>}
          </>
        }
        actions={
          <>
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => (setPref("dashboardLayout", []), setPref("hiddenWidgets", []))}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset layout
              </Button>
            )}
            <Button variant={editing ? "primary" : "secondary"} size="sm" onClick={() => setEditing((e) => !e)}>
              <LayoutGrid className="h-3.5 w-3.5" /> {editing ? "Done" : "Customize"}
            </Button>
          </>
        }
      />

      <div className="-mx-3 mb-5 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex shrink-0 snap-start items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs font-medium text-fg-secondary transition hover:border-accent/50 hover:text-fg"
          >
            <a.icon className="h-3.5 w-3.5 text-accent" />
            {a.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {order.map((id, idx) => {
          const w = WIDGETS.find((x) => x.id === id)!;
          const isHidden = hidden.has(id);
          if (isHidden && !editing) return null;
          return (
            <div key={id} className={cn("relative min-w-0 animate-fade-up md:col-span-1", w.span, isHidden && "opacity-40")} style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}>
              {editing && (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1 shadow-card">
                  <span className="px-1 text-2xs text-fg-muted">{w.title}</span>
                  <button className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-30" disabled={idx === 0} onClick={() => move(id, -1)} aria-label={`Move ${w.title} earlier`}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-30" disabled={idx === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${w.title} later`}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg" onClick={() => toggle(id)} aria-label={isHidden ? `Show ${w.title}` : `Hide ${w.title}`}>
                    {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
              {w.render("h-full")}
            </div>
          );
        })}
      </div>
      <Disclaimer short className="mt-8" />
    </>
  );
}
