import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, GraduationCap } from "lucide-react";
import { ACADEMY_MODULES, ACADEMY_TRACKS, readingMinutes } from "@/lib/academy/content";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { CompletionMark, ProgressSummary } from "@/components/academy/AcademyProgress";
import { JsonLd } from "@/components/marketing/JsonLd";
import { SITE } from "@/lib/config";

const DESCRIPTION =
  "Free XRP & XRP Ledger academy: 15 original modules on XRP, the XRPL, market basics, candlesticks, orders, risk, position sizing, indicators, on-chain and historical analysis, backtesting, paper trading, strategy design, journaling and common mistakes.";

// Public, indexable — overrides the terminal layout's noindex.
export const metadata: Metadata = {
  title: "Academy — learn XRP, the XRP Ledger and disciplined trading",
  description: DESCRIPTION,
  alternates: { canonical: "/academy" },
  robots: { index: true, follow: true },
  openGraph: { title: "XRP Terminal Academy", description: DESCRIPTION, url: "/academy", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "XRP Terminal Academy", description: DESCRIPTION, images: ["/og.png"] },
};

export default function AcademyPage() {
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Course",
          name: "XRP Terminal Academy",
          description: DESCRIPTION,
          url: `${SITE.url}/academy`,
          provider: { "@type": "Organization", name: "XRP Terminal", url: SITE.url },
          isAccessibleForFree: true,
          hasPart: ACADEMY_MODULES.map((m) => ({ "@type": "LearningResource", name: m.title, url: `${SITE.url}/academy/${m.slug}` })),
        }}
      />
      <PageHeader
        title="Academy"
        description="Original, neutral lessons on XRP, the XRP Ledger and disciplined market practice — each linked to the terminal tool where you can explore the concept with real data. No profit promises."
        badge={
          <Badge tone="accent">
            <GraduationCap className="h-3 w-3" /> {ACADEMY_MODULES.length} modules
          </Badge>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {ACADEMY_TRACKS.map((track) => {
            const mods = ACADEMY_MODULES.filter((m) => m.track === track.id);
            return (
              <section key={track.id} aria-labelledby={`track-${track.id}`}>
                <h2 id={`track-${track.id}`} className="text-base font-semibold text-fg">
                  {track.id}
                </h2>
                <p className="mt-0.5 text-xs text-fg-muted">{track.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {mods.map((m) => (
                    <Link key={m.slug} href={`/academy/${m.slug}`} className="card group flex flex-col p-4 transition-colors hover:border-border">
                      <div className="flex items-center justify-between">
                        <span className="num text-2xs font-semibold text-accent">MODULE {String(m.number).padStart(2, "0")}</span>
                        <CompletionMark slug={m.slug} />
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-fg group-hover:text-accent-strong">{m.title}</h3>
                      <p className="mt-1 flex-1 text-xs leading-relaxed text-fg-secondary">{m.summary}</p>
                      <div className="mt-3 flex items-center justify-between text-2xs text-fg-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {readingMinutes(m)} min · {m.level}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ProgressSummary total={ACADEMY_MODULES.length} />
          <div className="card card-pad text-xs leading-relaxed text-fg-secondary">
            <p className="font-medium text-fg">About the Academy</p>
            <p className="mt-1.5">Education only. Nothing here is investment advice, and no lesson promises profitability. Practise safely in the simulated Trade Lab.</p>
          </div>
        </aside>
      </div>
      <Disclaimer short className="mt-8" />
    </div>
  );
}
