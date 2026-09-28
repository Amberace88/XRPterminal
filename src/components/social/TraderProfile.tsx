"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, UserPlus, UserCheck } from "lucide-react";
import { PageHeader, Disclaimer, Hash } from "@/components/ui/Misc";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { TrustBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { BarChart } from "@/components/charts/Charts";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { formatDate, formatDateTime, formatDuration, formatNumber, formatPct } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { MIN_TRADES } from "@/lib/social/metrics";
import type { ClosedTrade, TraderMetrics, TraderPrivacy, VerificationStatus } from "@/lib/social/types";
import { MimicSimulation } from "./MimicSimulation";
import { ReportButton } from "./ReportButton";

interface ProfileResp {
  trader: { id: string; display_name: string; avatar_url: string | null; bio: string | null; verification_status: VerificationStatus; verified_at: string | null; privacy: TraderPrivacy; wallet: string | null };
  isOwner: boolean;
  metrics: TraderMetrics | null;
  open: { qty: number; avgPrice: number } | null;
  monthly: { month: string; pnl: number; trades: number }[];
  trades: (ClosedTrade & { pnl: number | null; quoteAsset: string | null })[];
  source: string | null;
  quoteAsset: string | null;
  computedAt: string | null;
}

function quoteName(q: string | null): string {
  if (!q) return "quote";
  const [cur] = q.split(".");
  if (cur.length === 40) {
    let s = "";
    for (let i = 0; i < 40; i += 2) {
      const c = parseInt(cur.slice(i, i + 2), 16);
      if (c) s += String.fromCharCode(c);
    }
    return /^[\x20-\x7E]+$/.test(s) ? s.trim() : cur.slice(0, 6);
  }
  return cur;
}

function FollowButton({ traderId }: { traderId: string }) {
  const { user, enabled } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = user ? getSupabaseBrowser() : null;
  useEffect(() => {
    if (!sb || !user) return;
    sb.from("follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", "trader")
      .eq("target_id", traderId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [sb, user, traderId]);
  if (!enabled || !user || !sb) return <Button size="xs" variant="outline" disabled title="Sign in to follow traders"><UserPlus className="h-3.5 w-3.5" /> Follow</Button>;
  const toggle = async () => {
    setBusy(true);
    if (following) await sb.from("follows").delete().eq("user_id", user.id).eq("target_type", "trader").eq("target_id", traderId);
    else await sb.from("follows").insert({ user_id: user.id, target_type: "trader", target_id: traderId });
    setFollowing(!following);
    setBusy(false);
  };
  return (
    <Button size="xs" variant={following ? "secondary" : "outline"} onClick={toggle} loading={busy || following === null}>
      {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />} {following ? "Following" : "Follow"}
    </Button>
  );
}

export function TraderProfile({ id }: { id: string }) {
  const { tz } = usePreferences();
  const { data, error, loading, reload } = useApi<ProfileResp>(`/api/traders/${encodeURIComponent(id)}`, { staleMs: 60_000 });
  const m = data?.metrics;
  const q = quoteName(data?.quoteAsset ?? null);
  const pf = m?.profitFactor;

  return (
    <div className="animate-fade-up">
      <Link href="/social" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Social
      </Link>
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error && !data ? (
        <Card>
          <ErrorState title={error.status === 404 ? "Trader not found" : undefined} message={error.message} onRetry={error.status === 404 ? undefined : reload} />
        </Card>
      ) : data ? (
        <>
          <PageHeader
            title={data.trader.display_name}
            badge={data.trader.verification_status === "VERIFIED" ? <TrustBadge kind="VERIFIED" /> : <Badge tone="warning">{data.trader.verification_status}</Badge>}
            description={data.trader.bio ?? undefined}
            actions={
              <>
                <FollowButton traderId={data.trader.id} />
                {!data.isOwner && <ReportButton targetType="trader" targetId={data.trader.id} />}
              </>
            }
          />
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-muted">
            {data.trader.verified_at && (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3 w-3 text-success" /> Wallet control proven on-chain {formatDateTime(data.trader.verified_at, tz)}
              </span>
            )}
            {data.trader.wallet && (
              <span className="inline-flex items-center gap-1">
                Wallet <Hash value={data.trader.wallet} href={`/xrpl/account/${data.trader.wallet}`} />
              </span>
            )}
            <span>Source: {data.source === "XRPL_DEX" ? "XRPL DEX fills (validated ledger data)" : (data.source ?? "—")}</span>
            {data.computedAt && <span>Computed {formatDateTime(data.computedAt, tz)}</span>}
            {data.isOwner && <Badge tone="info">Your profile — you see private fields</Badge>}
          </div>

          {!m || m.tradeCount === 0 ? (
            <Card className="mb-4">
              <EmptyState title="No verified trade history yet" description="Metrics appear once the verified wallet has closed round-trip trades on the XRP Ledger DEX (buy then sell against the same asset)." />
            </Card>
          ) : (
            <>
              {!m.eligible && (
                <div className="mb-3 rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-fg-secondary">
                  Insufficient sample — {m.ineligibleReason} Metrics are shown for transparency but are not statistically meaningful and not ranked (minimum {MIN_TRADES} trades).
                </div>
              )}
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Composite score" value={m.score != null ? m.score.toFixed(1) : "—"} sub="Not ROI-based" />
                <MetricCard label="ROI (compounded)" value={m.roiPct != null ? formatPct(m.roiPct) : "Private"} sub={m.totalPnl != null ? `P&L ${formatNumber(m.totalPnl, 2)} ${q}` : "P&L hidden by trader"} />
                <MetricCard label="Max drawdown" value={m.maxDrawdownPct != null ? `−${m.maxDrawdownPct.toFixed(1)}%` : "—"} sub="Per-trade compounded equity" />
                <MetricCard label="Win rate" value={m.winRate != null ? formatPct(m.winRate * 100, 0, false) : "—"} sub={`${m.wins}W / ${m.losses}L · ${m.tradeCount} trades`} />
                <MetricCard label="Risk-adjusted" value={m.riskAdjusted != null ? m.riskAdjusted.toFixed(2) : "—"} sub="Mean ÷ stdev of trade returns" size="sm" />
                <MetricCard label="Consistency" value={m.consistency != null ? `${Math.round(m.consistency * 100)}%` : "—"} sub={`Positive months · ${m.monthsCovered} months`} size="sm" />
                <MetricCard label="Profit factor" value={pf == null ? "—" : Number.isFinite(pf) ? pf.toFixed(2) : "∞"} sub="Gross profit ÷ gross loss" size="sm" />
                <MetricCard label="Avg holding time" value={formatDuration(m.avgHoldingMs)} sub={m.firstTradeAt ? `Since ${formatDate(m.firstTradeAt, tz)}` : undefined} size="sm" />
              </div>
            </>
          )}

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <Card>
                <CardHeader title="Monthly history" subtitle={`Realized P&L by month (${q})`} />
                <CardBody>
                  {data.monthly.length ? (
                    <BarChart data={data.monthly} x="month" series={[{ key: "pnl", label: `P&L (${q})` }]} signColors height={200} yFormat={(v) => formatNumber(v, 0)} />
                  ) : (
                    <p className="text-xs text-fg-muted">{data.trader.privacy.public_history || data.isOwner ? "No monthly history yet." : "The trader keeps history private."}</p>
                  )}
                </CardBody>
              </Card>
              <MimicSimulation
                trades={data.trades}
                quoteLabel={q}
                enabled={data.trades.length > 0}
                reason={data.trader.privacy.public_trades ? "No closed trades published yet." : "This trader has not made individual trades public, so a simulation is not possible."}
              />
            </div>
            <div className="space-y-4 lg:col-span-5">
              <Card>
                <CardHeader title="Open position" subtitle="Unmatched on-chain buys (FIFO)" />
                <CardBody>
                  {data.open ? (
                    <p className="num text-sm text-fg">
                      {formatNumber(data.open.qty, 0)} XRP @ avg {data.open.avgPrice.toFixed(5)} {q}
                    </p>
                  ) : (
                    <p className="text-xs text-fg-muted">{data.trader.privacy.public_positions || data.isOwner ? "No open position." : "Positions are private."}</p>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Recent trades" subtitle={data.trades.length ? `${data.trades.length} closed round trips` : undefined} />
                <CardBody>
                  {data.trades.length ? (
                    <ul className="max-h-80 space-y-1.5 overflow-auto pr-1">
                      {data.trades.slice(0, 50).map((t, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 border-b border-border-subtle/50 pb-1.5 text-2xs">
                          <span className="text-fg-muted">
                            {formatDate(t.entryTime, tz)} → {formatDate(t.exitTime, tz)}
                          </span>
                          <span className="num text-fg-secondary">{formatNumber(t.qty, 0)} XRP</span>
                          <span className={`num font-medium ${t.returnPct >= 0 ? "text-success" : "text-danger"}`}>{formatPct(t.returnPct)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-fg-muted">{data.trader.privacy.public_trades ? "No closed trades yet." : "Individual trades are private."}</p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      ) : null}
      <Disclaimer short className="mt-6" />
    </div>
  );
}
