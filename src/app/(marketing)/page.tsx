import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { INDEPENDENCE_STATEMENT, LEGAL_DISCLAIMER, SITE, isSupabaseConfigured } from "@/lib/config";
import { PLANS } from "@/lib/entitlements";
import { MARKET_PROVIDERS } from "@/lib/providers/market/registry";
import { XRPL_SERVERS } from "@/lib/xrpl/client";
import { ACADEMY_MODULES } from "@/lib/academy/content";
import { isCheckoutEnabled } from "@/lib/billing/stripe";
import { FAQ } from "@/components/marketing/content";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { PricingCards } from "@/components/marketing/PricingCards";
import { JsonLd } from "@/components/marketing/JsonLd";
import {
  FactsBand,
  FeatureSections,
  FinalCta,
  Hero,
  PrinciplesStrip,
  ProductOverview,
  SectionHeading,
  SecuritySection,
} from "@/components/marketing/sections";

const TITLE = "XRP Terminal — See beyond the price.";
const DESCRIPTION =
  "Independent XRP & XRP Ledger intelligence: live market data with visible sources, XRPL explorer and wallet intelligence, portfolio tracking, AI research, historical cycles, scenario ranges and a fully simulated Trade Lab. Non-custodial.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", title: TITLE, description: DESCRIPTION, siteName: "XRP Terminal", images: [{ url: "/og.png", width: 1200, height: 630, alt: "XRP Terminal — See beyond the price." }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function Home() {
  const accountsEnabled = isSupabaseConfigured();
  const billingEnabled = isCheckoutEnabled();
  const facts = [
    { value: Object.keys(MARKET_PROVIDERS).length, label: "Market data venues with automatic failover" },
    { value: XRPL_SERVERS.length, label: "Public XRPL servers, connected directly" },
    { value: ACADEMY_MODULES.length, label: "Academy modules — free to read" },
    { value: 0, label: "Seed phrases or private keys ever requested" },
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "XRP Terminal",
      url: SITE.url,
      logo: `${SITE.url}/brand/mark-512.png`,
      description: SITE.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "XRP Terminal",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: SITE.url,
      description: DESCRIPTION,
      offers: Object.values(PLANS).map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.priceEurMonthly.toFixed(2),
        priceCurrency: "EUR",
        category: p.priceEurMonthly === 0 ? "free" : "subscription",
      })),
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <Hero accountsEnabled={accountsEnabled} />
      <PrinciplesStrip />
      <ProductOverview />
      <FeatureSections />
      <FactsBand facts={facts} />

      <section id="pricing" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="pricing-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            id="pricing-title"
            align="center"
            eyebrow="Pricing"
            title="Simple plans. A Free tier that's actually useful."
            description="Start free with real data. Upgrade when you need more accounts, longer forecast horizons, higher AI limits and advanced Trade Lab tools."
          />
          <PricingCards className="mt-14" billingEnabled={billingEnabled} accountsEnabled={accountsEnabled} />
          <div className="mt-6 text-center">
            <Link href="/pricing" className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:text-fg">
              Compare every feature <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <SecuritySection />

      <section id="faq" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="faq-title">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <SectionHeading
            id="faq-title"
            eyebrow="FAQ"
            title="Straight answers."
            description={
              <>
                Something missing? Read the{" "}
                <Link href="/security" className="text-accent-strong hover:underline">
                  security overview
                </Link>{" "}
                or the{" "}
                <Link href="/legal/risk" className="text-accent-strong hover:underline">
                  risk disclosure
                </Link>
                .
              </>
            }
          />
          <FaqAccordion items={FAQ} />
        </div>
      </section>

      <FinalCta accountsEnabled={accountsEnabled} />

      <section aria-labelledby="legal-title" className="border-t border-border-subtle bg-bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h2 id="legal-title" className="label flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5" /> Legal
          </h2>
          <p className="mt-3 max-w-5xl text-xs leading-relaxed text-fg-muted">{LEGAL_DISCLAIMER}</p>
          <p className="mt-2 max-w-5xl text-xs leading-relaxed text-fg-muted">{INDEPENDENCE_STATEMENT}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/legal/risk" className="text-fg-secondary hover:text-fg">
              Risk disclosure
            </Link>
            <Link href="/legal/terms" className="text-fg-secondary hover:text-fg">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="text-fg-secondary hover:text-fg">
              Privacy Policy
            </Link>
            <Link href="/legal/disclaimer" className="text-fg-secondary hover:text-fg">
              Disclaimer
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
