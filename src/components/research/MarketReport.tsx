"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ClaimLabel } from "@/components/ui/Misc";
import { KindLabel } from "@/components/ai/KindLabel";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/components/ui/Toast";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { formatCompactMoney, formatDateTime, formatPct, formatPrice } from "@/lib/format";
import { LEGAL_DISCLAIMER, INDEPENDENCE_STATEMENT, SITE } from "@/lib/config";
import type { SourceRef } from "@/lib/intel/types";
import type { BriefApiResponse } from "@/components/ai/types";
import { REPORT_SECTIONS } from "./sections";

/**
 * Printable market research report (spec §225, §228). Shareable URL carries only public
 * parameters (type, sections, ai flag) — numbers are recomputed when opened.
 */
export function MarketReport() {
  const sp = useSearchParams();
  const toast = useToast();
  const { tz } = usePreferences();
  const type = sp.get("type") === "weekly" ? "weekly" : "daily";
  const wantAi = sp.get("ai") === "1";
  const selected = useMemo(() => {
    const raw = (sp.get("sections") ?? "").split(",").filter(Boolean);
    const valid = REPORT_SECTIONS.filter((s) => raw.includes(s.id));
    return valid.length ? valid : REPORT_SECTIONS;
  }, [sp]);
  const { data, error, loading, reload } = useApi<BriefApiResponse>(`/api/ai/brief?type=${type}${wantAi ? "&narrative=1" : ""}`, { staleMs: 5 * 60_000 });
  const [generatedAt] = useState(() => Date.now());

  const briefIds = new Set(selected.flatMap((s) => s.briefIds));
  const sections = data?.brief.sections.filter((s) => briefIds.has(s.id)) ?? [];
  const sources = useMemo(() => {
    const all: SourceRef[] = sections.flatMap((s) => s.items.flatMap((i) => i.sources));
    const seen = new Set<string>();
    return all.filter((x) => {
      const k = `${x.label}|${x.url ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [sections]);
  const s = data?.snapshot;
  const narrative = data?.ai.narrative;

  const share = async () => {
    const url = `${window.location.origin}/research/report?type=${type}&sections=${selected.map((x) => x.id).join(",")}${wantAi ? "&ai=1" : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Contains only report parameters — numbers are recomputed when opened.", tone: "success" });
    } catch {
      toast({ title: "Copy failed", description: url, tone: "warning" });
    }
  };

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #research-report, #research-report * { visibility: visible !important; }
        #research-report { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0 12mm; background: #fff; color: #111; }
        #research-report .print-muted { color: #555 !important; }
        #research-report a { color: #111 !important; text-decoration: underline; }
        @page { margin: 14mm 0; }
      }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/research" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Research
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={share}>
            <Share2 className="h-4 w-4" /> Copy link
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <article id="research-report" className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-8">
        <header className="border-b border-border-subtle pb-4">
          <p className="label print-muted">{SITE.name} · Market research report</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{type === "weekly" ? "Weekly" : "Daily"} XRP market report</h1>
          <p className="print-muted mt-1 text-xs text-fg-muted">
            Generated {formatDateTime(generatedAt, tz)}
            {s ? ` · data as of ${formatDateTime(s.asOf, tz)}` : ""}
          </p>
        </header>

        {loading && !data ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : data && s ? (
          <>
            <section className="grid grid-cols-2 gap-3 border-b border-border-subtle py-4 sm:grid-cols-4">
              {[
                ["XRP / USD", formatPrice(s.market.price)],
                ["24h", formatPct(s.market.changePct24h)],
                [type === "weekly" ? "7D" : "30D", formatPct(type === "weekly" ? s.returns.d7 : s.returns.d30)],
                ["Regime", s.regime.current ?? "n/a"],
                ["Risk", s.risk.level ? `${s.risk.level} (${s.risk.score?.toFixed(0)})` : "n/a"],
                ["30D vol (ann.)", s.volatility.vol30Pct != null ? `${s.volatility.vol30Pct.toFixed(0)}%` : "—"],
                ["BTC corr. 30D", s.correlation.btc30?.toFixed(2) ?? "—"],
                ["24h volume (venue)", formatCompactMoney(s.market.volume24hQuote)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="label print-muted">{k}</div>
                  <div className="num text-sm font-semibold text-fg">{v}</div>
                </div>
              ))}
            </section>

            {sections.map((sec) => (
              <section key={sec.id} className="break-inside-avoid border-b border-border-subtle py-4">
                <h2 className="mb-2 text-sm font-semibold text-fg">
                  {sec.n}. {sec.title}
                </h2>
                <ul className="space-y-1.5">
                  {sec.items.map((it, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-secondary">
                      <span className="mt-0.5 shrink-0">
                        <KindLabel kind={it.kind} />
                      </span>
                      <span>{it.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {wantAi && (
              <section className="break-inside-avoid border-b border-border-subtle py-4">
                <h2 className="mb-2 text-sm font-semibold text-fg">AI narrative (model output)</h2>
                {narrative ? (
                  <div className="space-y-2 text-sm text-fg-secondary">
                    <p>{narrative.summary}</p>
                    {narrative.analysis.map((a, i) => (
                      <p key={i} className="flex gap-2">
                        <ClaimLabel kind="ANALYSIS" /> {a}
                      </p>
                    ))}
                    {narrative.scenarios.map((a, i) => (
                      <p key={`s${i}`} className="flex gap-2">
                        <ClaimLabel kind="SCENARIO" /> {a}
                      </p>
                    ))}
                    <p className="print-muted text-2xs text-fg-muted">
                      {narrative.model} · {formatDateTime(narrative.generatedAt, tz)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted">{data.ai.message ?? "AI narrative unavailable."}</p>
                )}
              </section>
            )}

            <section className="break-inside-avoid border-b border-border-subtle py-4">
              <h2 className="mb-2 text-sm font-semibold text-fg">Methodology</h2>
              <p className="text-xs leading-relaxed text-fg-secondary">{data.brief.methodology}</p>
              <p className="mt-2 text-xs text-fg-secondary">Regime methodology {s.regime.methodologyVersion ?? "n/a"}. Returns measured against UTC daily closes. Correlations use daily log returns.</p>
            </section>

            <section className="py-4">
              <h2 className="mb-2 text-sm font-semibold text-fg">Sources</h2>
              <ul className="space-y-1 text-xs text-fg-secondary">
                {sources.map((x, i) => (
                  <li key={i}>
                    {x.url && !x.url.startsWith("/") ? (
                      <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-accent-strong hover:underline">
                        {x.label}
                      </a>
                    ) : (
                      x.label
                    )}
                    {x.timestamp ? <span className="print-muted text-fg-muted"> · {formatDateTime(x.timestamp, tz)}</span> : null}
                    {x.url && !x.url.startsWith("/") && <span className="print-muted hidden break-all text-fg-muted print:inline"> — {x.url}</span>}
                  </li>
                ))}
                <li className="print-muted text-fg-muted">Providers: {s.providers.join(" · ") || "—"}</li>
              </ul>
            </section>

            <footer className="print-muted space-y-1 border-t border-border-subtle pt-4 text-[10px] leading-relaxed text-fg-muted">
              <p>{LEGAL_DISCLAIMER}</p>
              <p>{INDEPENDENCE_STATEMENT}</p>
            </footer>
          </>
        ) : null}
      </article>
    </div>
  );
}
