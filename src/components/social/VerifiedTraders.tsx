"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { TrustBadge, Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, NotConnected, SkeletonRows } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { formatPct } from "@/lib/format";
import type { LeaderboardSort } from "@/lib/social/metrics";
import type { PublicTrader } from "@/lib/social/types";

interface Resp {
  configured: boolean;
  traders: PublicTrader[];
  ranked: string[];
  methodology: { weights: Record<string, number>; minTrades: number; minSpanDays: number; note: string };
}

const SORTS: { value: LeaderboardSort; label: string }[] = [
  { value: "score", label: "Composite" },
  { value: "riskAdjusted", label: "Risk-adjusted" },
  { value: "consistency", label: "Consistency" },
  { value: "drawdown", label: "Lowest drawdown" },
  { value: "sample", label: "Sample size" },
];

const f2 = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));

/** Verified traders directory + leaderboard (spec §82, §86). Never ranked by ROI alone. */
export function VerifiedTraders({ className }: { className?: string }) {
  const [sort, setSort] = useState<LeaderboardSort>("score");
  const { data, error, loading, reload } = useApi<Resp>(`/api/traders?sort=${sort}`, { staleMs: 60_000 });
  const byId = useMemo(() => new Map((data?.traders ?? []).map((t) => [t.id, t])), [data]);
  const ranked = (data?.ranked ?? []).map((id) => byId.get(id)!).filter(Boolean);
  const unranked = (data?.traders ?? []).filter((t) => !t.metrics?.eligible);

  return (
    <Card className={className}>
      <CardHeader
        title="Verified traders"
        icon={<Users className="h-4 w-4" />}
        subtitle="Performance computed from verified on-chain XRPL DEX activity"
        info={data?.methodology.note}
        actions={<Tabs size="xs" value={sort} onChange={setSort} items={SORTS} ariaLabel="Leaderboard ranking" className="hidden md:inline-flex" />}
      />
      <CardBody>
        <Tabs size="xs" value={sort} onChange={setSort} items={SORTS} ariaLabel="Leaderboard ranking" className="mb-3 md:hidden" />
        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : error && !data ? (
          <ErrorState compact message={error.message} onRetry={reload} />
        ) : data && !data.configured ? (
          <NotConnected what="The verified-trader directory needs the account database, which is not configured on this deployment." how="No traders are shown — we never display sample or invented traders." className="py-6" />
        ) : data && data.traders.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No verified traders yet" description="Be the first: link a public XRPL wallet below. Profiles appear here once verified and made public by their owner." />
        ) : (
          <div className="space-y-4">
            {ranked.length > 0 ? (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-2xs uppercase tracking-wide text-fg-muted">
                      <th className="px-4 py-2 sm:px-5">#</th>
                      <th className="py-2">Trader</th>
                      <th className="py-2 text-right">Score</th>
                      <th className="py-2 text-right">Risk-adj.</th>
                      <th className="py-2 text-right">Consistency</th>
                      <th className="py-2 text-right">Max DD</th>
                      <th className="py-2 text-right">Win rate</th>
                      <th className="px-4 py-2 text-right sm:px-5">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((t, i) => (
                      <tr key={t.id} className="border-b border-border-subtle/60 transition-colors hover:bg-surface-hover/50">
                        <td className="num px-4 py-2 text-fg-muted sm:px-5">{i === 0 ? <Trophy className="h-3.5 w-3.5 text-warning" /> : i + 1}</td>
                        <td className="py-2">
                          <Link href={`/social/trader/${t.id}`} className="font-medium text-fg hover:text-accent-strong hover:underline">
                            {t.display_name}
                          </Link>
                        </td>
                        <td className="num py-2 text-right font-semibold text-fg">{f2(t.metrics?.score, 1)}</td>
                        <td className="num py-2 text-right">{f2(t.metrics?.riskAdjusted)}</td>
                        <td className="num py-2 text-right">{t.metrics?.consistency != null ? `${Math.round(t.metrics.consistency * 100)}%` : "—"}</td>
                        <td className="num py-2 text-right text-danger">{t.metrics?.maxDrawdownPct != null ? `−${t.metrics.maxDrawdownPct.toFixed(1)}%` : "—"}</td>
                        <td className="num py-2 text-right">{t.metrics?.winRate != null ? formatPct(t.metrics.winRate * 100, 0, false) : "—"}</td>
                        <td className="num px-4 py-2 text-right sm:px-5">{t.metrics?.tradeCount ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-fg-muted">No trader meets the minimum sample yet ({data?.methodology.minTrades} closed trades over {data?.methodology.minSpanDays}+ days), so nobody is ranked.</p>
            )}
            {unranked.length > 0 && (
              <div>
                <h4 className="label mb-1.5">Verified — not ranked (insufficient data)</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {unranked.map((t) => (
                    <li key={t.id}>
                      <Link href={`/social/trader/${t.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-xs text-fg-secondary hover:border-border hover:text-fg">
                        {t.display_name} <TrustBadge kind="VERIFIED" className="scale-90" />
                        <span className="text-2xs text-fg-muted">{t.metrics?.tradeCount ?? 0} trades</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
      {data?.methodology && (
        <CardFooter>
          <span className="truncate">
            Score = {Object.entries(data.methodology.weights).map(([k, w]) => `${Math.round(w * 100)}% ${k}`).join(" · ")}
          </span>
          <Badge tone="neutral">Not ROI-ranked</Badge>
        </CardFooter>
      )}
    </Card>
  );
}

