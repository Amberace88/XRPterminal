import Link from "next/link";
import { LEGAL_LAST_UPDATED } from "./content";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/risk", label: "Risk Disclosure" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/disclaimer", label: "Disclaimer" },
];

/** Shared layout for legal documents: title, last-updated date, table of contents, readable prose. */
export function LegalPage({ title, intro, sections, current }: { title: string; intro: React.ReactNode; sections: LegalSection[]; current: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Legal documents" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={l.href === current ? "page" : undefined}
                className={
                  l.href === current
                    ? "whitespace-nowrap rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-fg"
                    : "whitespace-nowrap rounded-lg px-3 py-2 text-sm text-fg-secondary hover:bg-surface-hover hover:text-fg"
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="On this page" className="mt-8 hidden lg:block">
            <p className="label mb-2 px-3">On this page</p>
            <ol className="space-y-1">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded px-3 py-1 text-xs text-fg-muted hover:text-fg">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl">
          <p className="label">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-fg-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
          <div className="prose-legal mt-6">
            <div className="text-sm leading-7 text-fg-secondary">{intro}</div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2>
                  {i + 1}. {s.title}
                </h2>
                {s.content}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
