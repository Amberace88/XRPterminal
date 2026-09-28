import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";
import { PLANS, type PlanDefinition, type PlanId } from "@/lib/entitlements";
import { isCheckoutEnabled } from "@/lib/billing/stripe";
import { PricingCards } from "@/components/marketing/PricingCards";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { SectionHeading } from "@/components/marketing/sections";
import { JsonLd } from "@/components/marketing/JsonLd";
import { ParallaxGrid } from "@/components/marketing/motion";
import { cn } from "@/lib/utils/cn";
import { SITE } from "@/lib/config";

const DESCRIPTION = "XRP Terminal plans in EUR: Free (€0), Pro (€9.99/month) and Pro+ (€19.99/month). Compare limits and features — the Free plan includes live data, the XRPL explorer and a simulated Trade Lab.";

export const metadata: Metadata = {
  title: "Pricing",
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing · XRP Terminal", description: DESCRIPTION, url: "/pricing", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Pricing · XRP Terminal", description: DESCRIPTION, images: ["/og.png"] },
};

const ORDER: PlanId[] = ["free", "pro", "proplus"];

type Row = { label: string; value: (p: PlanDefinition) => string | boolean };
const fmtLimit = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "Unlimited");

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Limits",
    rows: [
      { label: "Connected wallets & accounts", value: (p) => fmtLimit(p.limits.connectedAccounts) },
      { label: "Alerts", value: (p) => fmtLimit(p.limits.alerts) },
      { label: "Watchlist items", value: (p) => fmtLimit(p.limits.watchlistItems) },
      { label: "Paper trading accounts", value: (p) => fmtLimit(p.limits.paperAccounts) },
      { label: "AI requests per day", value: (p) => fmtLimit(p.limits.aiRequestsPerDay) },
      { label: "Claim checks per day", value: (p) => fmtLimit(p.limits.claimChecksPerDay) },
      { label: "Backtests per day", value: (p) => fmtLimit(p.limits.backtestsPerDay) },
    ],
  },
  {
    title: "Intelligence",
    rows: [
      { label: "Advanced forecast analytics", value: (p) => p.features.advancedForecast },
      { label: "Long-horizon scenario ranges", value: (p) => p.features.longHorizonForecast },
      { label: "Entity graph", value: (p) => p.features.entityGraph },
      { label: "Reports", value: (p) => p.features.reports },
      { label: "Read-only exchange connections", value: (p) => p.features.exchangeConnections },
    ],
  },
  {
    title: "Trade Lab (simulated)",
    rows: [
      { label: "Strategy Lab", value: (p) => p.features.strategyLab },
      { label: "Historical replay", value: (p) => p.features.historicalReplay },
      { label: "Advanced Trade Lab tools", value: (p) => p.features.advancedTradeLab },
    ],
  },
  {
    title: "Alerts",
    rows: [
      { label: "Advanced alerts", value: (p) => p.features.advancedAlerts },
      { label: "Smart multi-condition alerts", value: (p) => p.features.smartAlerts },
    ],
  },
];

const INCLUDED = [
  "Live XRP market data with source & freshness",
  "Public XRPL explorer and wallet lookup",
  "Historical statistics, drawdowns and cycles",
  "The full Academy",
  "Guest mode — no account needed",
  "Data export and account deletion",
];

const PRICING_FAQ = [
  { q: "How does billing work?", a: "Paid plans are monthly subscriptions processed by Stripe. Your plan is activated as soon as Stripe confirms the payment to us, and renews monthly until you cancel." },
  { q: "Can I change or cancel my plan?", a: "Yes. Upgrade, downgrade or cancel at any time from Settings → Billing, which opens the Stripe customer portal. When you cancel, your plan stays active until the end of the period you have paid for, then your account moves to Free — your data is kept." },
  { q: "Does XRP Terminal store my card details?", a: "No. Payments are handled entirely by Stripe. We never see or store your full card number." },
  { q: "Which payment methods are accepted?", a: "The methods offered by Stripe Checkout for your country — typically major cards and, in many regions, additional local methods." },
  { q: "Are taxes included?", a: "Prices are shown in EUR. Depending on your location, applicable taxes such as VAT may be calculated and added at checkout." },
  { q: "What if I was charged incorrectly?", a: "Contact support and we will review it. Your statutory consumer rights in your country always apply." },
  { q: "Do paid plans give better data or trading signals?", a: "Paid plans raise limits and unlock deeper tools. Every plan uses the same real data sources, and no plan provides investment advice, trading signals or guaranteed results." },
];

function Cell({ v, featured }: { v: string | boolean; featured: boolean }) {
  if (v === true) return <Check className={cn("mx-auto h-4 w-4", featured ? "text-accent" : "text-success")} aria-label="Included" />;
  if (v === false) return <Minus className="mx-auto h-4 w-4 text-fg-muted/60" aria-label="Not included" />;
  return <span className="num text-sm text-fg">{v}</span>;
}

export default function PricingPage() {
  const accountsEnabled = isSupabaseConfigured();
  const billingEnabled = isCheckoutEnabled();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "XRP Terminal",
          description: DESCRIPTION,
          brand: { "@type": "Brand", name: "XRP Terminal" },
          url: `${SITE.url}/pricing`,
          offers: ORDER.map((id) => ({ "@type": "Offer", name: PLANS[id].name, price: PLANS[id].priceEurMonthly.toFixed(2), priceCurrency: "EUR", url: `${SITE.url}/pricing` })),
        }}
      />
      <section className="relative isolate overflow-hidden pb-20 pt-14 sm:pt-20">
        <ParallaxGrid className="opacity-40" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            align="center"
            eyebrow="Pricing"
            title="Choose the depth you need."
            description="Every plan uses the same real data. Paid plans add accounts, longer horizons, higher AI and research limits, and advanced Trade Lab tools."
          />
          <PricingCards className="mt-14" billingEnabled={billingEnabled} accountsEnabled={accountsEnabled} />
        </div>
      </section>

      <section className="pb-20" aria-labelledby="included-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
            <h2 id="included-title" className="text-lg font-semibold text-fg">
              Included in every plan
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INCLUDED.map((i) => (
                <li key={i} className="flex gap-2.5 text-sm text-fg-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {i}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="pb-24" aria-labelledby="compare-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="compare-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Compare plans
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Feature comparison between Free, Pro and Pro+</caption>
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="sticky left-0 z-10 bg-surface px-5 py-4 text-sm font-medium text-fg-secondary">
                    Feature
                  </th>
                  {ORDER.map((id) => (
                    <th key={id} scope="col" className={cn("px-5 py-4 text-center", id === "pro" && "bg-accent/[0.05]")}>
                      <span className="block text-sm font-semibold text-fg">{PLANS[id].name}</span>
                      <span className="num block text-xs text-fg-muted">€{PLANS[id].priceEurMonthly.toFixed(2)} / mo</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {GROUPS.map((g) => (
                <tbody key={g.title}>
                  <tr>
                    <th colSpan={4} scope="colgroup" className="bg-bg-secondary/60 px-5 py-2 text-left">
                      <span className="label">{g.title}</span>
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-t border-border-subtle/70">
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-3 text-sm font-normal text-fg-secondary">
                        {r.label}
                      </th>
                      {ORDER.map((id) => (
                        <td key={id} className={cn("px-5 py-3 text-center", id === "pro" && "bg-accent/[0.05]")}>
                          <Cell v={r.value(PLANS[id])} featured={id === "pro"} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-muted">Limits are enforced by the central entitlement engine. Trade Lab is a simulation for every plan — no plan executes real trades.</p>
        </div>
      </section>

      <section className="pb-28" aria-labelledby="pricing-faq-title">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <SectionHeading id="pricing-faq-title" eyebrow="Billing FAQ" title="Questions about plans." />
          <FaqAccordion items={PRICING_FAQ} />
        </div>
      </section>
    </>
  );
}
