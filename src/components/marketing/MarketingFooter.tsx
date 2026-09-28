import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { INDEPENDENCE_STATEMENT } from "@/lib/config";
import { CookieSettingsButton } from "./CookieSettingsButton";
import { Wordmark } from "./Wordmark";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/market", label: "Market" },
      { href: "/xrpl", label: "XRPL Explorer" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/historical", label: "Historical" },
      { href: "/future", label: "Future" },
      { href: "/trade-lab", label: "Trade Lab" },
      { href: "/alerts", label: "Alerts" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/academy", label: "Academy" },
      { href: "/security", label: "Security" },
      { href: "/research", label: "Research" },
      { href: "/calculators", label: "Calculators" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/risk", label: "Risk Disclosure" },
      { href: "/legal/cookies", label: "Cookie Policy" },
      { href: "/legal/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function MarketingFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="border-t border-border-subtle bg-bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="XRP Terminal home">
              <LogoMark size={30} />
              <Wordmark />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-fg-secondary">
              Independent XRP & XRP Ledger intelligence. See beyond the price.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-fg-muted">Non-custodial. Read-only. We never ask for seed phrases or private keys.</p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="label mb-3">{c.title}</h2>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-fg-secondary transition-colors hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
                {c.title === "Legal" && (
                  <li>
                    <CookieSettingsButton className="text-sm text-fg-secondary transition-colors hover:text-fg" />
                  </li>
                )}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border-subtle pt-6 text-xs leading-relaxed text-fg-muted md:flex-row md:items-start md:justify-between">
          <p>© {year} XRP Terminal. All rights reserved.</p>
          <p className="max-w-2xl md:text-right">{INDEPENDENCE_STATEMENT} Not investment advice.</p>
        </div>
      </div>
    </footer>
  );
}
