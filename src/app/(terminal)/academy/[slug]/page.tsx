import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, Lightbulb } from "lucide-react";
import { ACADEMY_MODULES, getAcademyModule, readingMinutes } from "@/lib/academy/content";
import { Badge } from "@/components/ui/Badge";
import { Disclaimer } from "@/components/ui/Misc";
import { MarkCompleteButton } from "@/components/academy/AcademyProgress";
import { JsonLd } from "@/components/marketing/JsonLd";
import { SITE } from "@/lib/config";

export function generateStaticParams() {
  return ACADEMY_MODULES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = getAcademyModule(slug);
  if (!m) return { title: "Module not found", robots: { index: false } };
  return {
    title: `${m.title} — Academy`,
    description: m.summary,
    alternates: { canonical: `/academy/${m.slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "article", title: `${m.title} · XRP Terminal Academy`, description: m.summary, url: `/academy/${m.slug}`, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: `${m.title} · XRP Terminal Academy`, description: m.summary, images: ["/og.png"] },
  };
}

export default async function AcademyModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = getAcademyModule(slug);
  if (!m) notFound();
  const idx = ACADEMY_MODULES.findIndex((x) => x.slug === m.slug);
  const prev = ACADEMY_MODULES[idx - 1];
  const next = ACADEMY_MODULES[idx + 1];

  return (
    <div className="mx-auto max-w-5xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LearningResource",
          name: m.title,
          description: m.summary,
          url: `${SITE.url}/academy/${m.slug}`,
          educationalLevel: m.level,
          timeRequired: `PT${readingMinutes(m)}M`,
          isAccessibleForFree: true,
          inLanguage: "en",
          isPartOf: { "@type": "Course", name: "XRP Terminal Academy", url: `${SITE.url}/academy` },
          provider: { "@type": "Organization", name: "XRP Terminal", url: SITE.url },
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-fg-muted">
        <Link href="/academy" className="inline-flex items-center gap-1 hover:text-fg">
          <ArrowLeft className="h-3 w-3" /> Academy
        </Link>
        <span className="mx-2">/</span>
        <span>{m.track}</span>
      </nav>

      <header className="mb-6">
        <span className="num text-xs font-semibold text-accent">MODULE {String(m.number).padStart(2, "0")} OF {ACADEMY_MODULES.length}</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{m.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-secondary sm:text-base">{m.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs text-fg-muted">
          <Badge>{m.level}</Badge>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {readingMinutes(m)} min read
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <article className="card card-pad min-w-0 sm:p-7">
          {m.sections.map((s) => (
            <section key={s.heading} className="mb-7 last:mb-0">
              <h2 className="text-lg font-semibold tracking-tight text-fg">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-7 text-fg-secondary">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-3 space-y-2">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5 text-sm leading-6 text-fg-secondary">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="mt-8 rounded-xl border border-accent/25 bg-accent/[0.05] p-5" aria-labelledby="takeaways">
            <h2 id="takeaways" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Lightbulb className="h-4 w-4 text-accent" /> Key takeaways
            </h2>
            <ul className="mt-3 space-y-2">
              {m.takeaways.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-fg-secondary">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <MarkCompleteButton slug={m.slug} />
            <div className="flex gap-2">
              {prev && (
                <Link href={`/academy/${prev.slug}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface-hover hover:text-fg">
                  <ArrowLeft className="h-3.5 w-3.5" /> {prev.title}
                </Link>
              )}
              {next && (
                <Link href={`/academy/${next.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-fg ring-1 ring-border hover:bg-surface-hover">
                  {next.title} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </article>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card card-pad">
            <p className="label">Try it in the terminal</p>
            <ul className="mt-3 space-y-2">
              {m.tools.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="group block rounded-lg border border-border-subtle p-3 transition-colors hover:border-accent/40">
                    <span className="flex items-center justify-between text-sm font-medium text-fg">
                      {t.label} <ArrowUpRight className="h-3.5 w-3.5 text-fg-muted group-hover:text-accent" />
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{t.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="px-1 text-2xs leading-relaxed text-fg-muted">Educational content only — not investment advice. Past and simulated results do not guarantee future results.</p>
        </aside>
      </div>
      <Disclaimer short className="mt-8" />
    </div>
  );
}
