"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpenText, CandlestickChart, FileText, FlaskConical, History, Network, Newspaper, Sparkles, Telescope, Users } from "lucide-react";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { formatPct, formatPrice } from "@/lib/format";
import type { BriefApiResponse } from "@/components/ai/types";
import { REPORT_SECTIONS } from "./sections";

const HUB = [
  { title: "Market", icon: CandlestickChart, desc: "Live prices, charts, order book, regime and risk engines.", links: [["/market", "Market overview"], ["/calculators", "Calculators"]] },
  { title: "XRPL", icon: Network, desc: "Ledger explorer, wallet lookup, whale transfers and network activity.", links: [["/xrpl", "Explorer"], ["/xrpl/whales", "Whale monitor"], ["/xrpl/activity", "Network activity"], ["/xrpl/graph", "Entity graph"]] },
  { title: "Historical", icon: History, desc: "Cycles, drawdowns, recoveries, seasonality and volatility history.", links: [["/historical", "Historical intelligence"]] },
  { title: "Future", icon: Telescope, desc: "Scenario ranges with uncertainty, model versions and forecast history.", links: [["/future", "Future intelligence"]] },
  { title: "AI", icon: Sparkles, desc: "Data-grounded daily and weekly briefs, and questions answered from the snapshot.", links: [["/ai", "AI briefs"]] },
  { title: "News", icon: Newspaper, desc: "Clustered headlines with source links, event intelligence and Claim Check.", links: [["/news", "News"], ["/news/claim-check", "Claim Check"]] },
  { title: "Social", icon: Users, desc: "Verified traders (on-chain proof), headline sentiment and scam protection.", links: [["/social", "Social intelligence"]] },
  { title: "Trade Lab", icon: FlaskConical, desc: "Paper trading, historical replay and strategy backtests — simulation only.", links: [["/trade-lab", "Trade Lab"], ["/trade-lab/replay", "Replay"], ["/trade-lab/strategy", "Strategy Lab"]] },
] as const;

export function ResearchHub() {
  const [type, setType] = useState<"daily" | "weekly">("daily");
  const [sections, setSections] = useState<string[]>(REPORT_SECTIONS.map((s) => s.id));
  const [withAi, setWithAi] = useState(false);
  const { data, loading } = useApi<BriefApiResponse>(`/api/ai/brief?type=${type}`, { staleMs: 5 * 60_000 });
  const s = data?.snapshot;
  const href = `/research/report?type=${type}&sections=${sections.join(",")}${withAi ? "&ai=1" : ""}`;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Research" description="Every intelligence module in one place, plus a printable market research report that combines current numbers with methodology and sources." />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
          {HUB.map((h) => (
            <Card key={h.title} className="transition-colors hover:border-border">
              <CardHeader title={h.title} icon={<h.icon className="h-4 w-4" />} />
              <CardBody className="space-y-2.5">
                <p className="text-xs leading-relaxed text-fg-secondary">{h.desc}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {h.links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-2xs text-fg-secondary transition-colors hover:border-accent/40 hover:text-fg">
                        {label} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
        <aside className="lg:col-span-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Market research report" icon={<FileText className="h-4 w-4" />} subtitle="Printable · shareable link contains only public parameters" />
            <CardBody className="space-y-4">
              <Tabs
                value={type}
                onChange={setType}
                ariaLabel="Report type"
                items={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
              <div className="rounded-lg border border-border-subtle bg-bg-secondary/40 p-3">
                {loading && !s ? (
                  <Skeleton className="h-12 w-full" />
                ) : s ? (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-fg-muted">XRP/USD</span>
                      <span className="num text-fg">
                        {formatPrice(s.market.price)} <span className="text-fg-muted">{formatPct(s.market.changePct24h)}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-fg-muted">Regime · Risk</span>
                      <span className="text-fg">
                        {s.regime.current ?? "n/a"} · {s.risk.level ?? "n/a"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-fg-muted">XRP stories ({s.news.windowHours}h)</span>
                      <span className="num text-fg">{s.news.clusters.length}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted">Snapshot unavailable.</p>
                )}
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-fg-secondary">Sections</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {REPORT_SECTIONS.map((sec) => (
                    <label key={sec.id} className="flex items-center gap-2 text-xs text-fg-secondary">
                      <input
                        type="checkbox"
                        className="accent-[rgb(var(--accent))]"
                        checked={sections.includes(sec.id)}
                        onChange={(e) => setSections((cur) => (e.target.checked ? [...cur, sec.id] : cur.filter((x) => x !== sec.id)))}
                      />
                      {sec.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} disabled={data ? !data.aiConfigured : true} />
                Include AI narrative {data && !data.aiConfigured && <Badge tone="neutral">not connected</Badge>}
              </label>
              <ButtonLink href={href} className="w-full" size="md">
                <BookOpenText className="h-4 w-4" /> Generate report
              </ButtonLink>
              <p className="text-2xs text-fg-muted">Numbers are computed deterministically at generation time; AI (optional) only narrates. Sources and methodology are included.</p>
            </CardBody>
          </Card>
        </aside>
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
