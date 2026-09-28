import type { Metadata } from "next";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { HistoricalView } from "@/components/historical/HistoricalView";

const TITLE = "XRP Price History & Historical Analysis — Cycles, Drawdowns, Seasonality";
const DESCRIPTION =
  "Data-driven XRP historical intelligence: all-time high analysis, market cycles, drawdown and recovery statistics, volatility history, monthly seasonality with sample sizes, correlation with BTC and ETH, historical analogues and stress tests.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Flagship public analysis page — override the terminal's default noindex.
  robots: { index: true, follow: true },
  alternates: { canonical: "/historical" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/historical" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const QUESTIONS: [string, string][] = [
  ["What happened before?", "ATH analysis and the full daily price history from a single, named exchange provider."],
  ["How did XRP behave during previous cycles?", "Major cycles identified by a documented peak/trough rule, with return, drawdown, duration, recovery and volatility per cycle."],
  ["How deep were drawdowns and how long did recovery take?", "Every swing decline of 20%, 30% or 50%+ with depth, time to recover, and median / mean / min / max statistics with sample sizes."],
  ["How did XRP behave relative to BTC and ETH?", "Correlation of daily returns over 30, 90, 180 and 365 days, rolling correlation and beta."],
  ["What historical periods resemble current conditions?", "Nearest historical analogues by trend, momentum, volatility and drawdown — with what happened next, and why that is not a forecast."],
];

export default function HistoricalPage() {
  return (
    <article>
      <PageHeader
        title="XRP Historical Intelligence"
        badge={<Badge tone="info">Facts & statistics</Badge>}
        description="How XRP has behaved in the past — cycles, drawdowns, recoveries, volatility, seasonality and cross-asset correlation — computed deterministically from real daily exchange data, with sample sizes and methodology for every figure."
      />
      <HistoricalView />
      <section aria-labelledby="about-historical" className="mt-10 border-t border-border-subtle pt-6">
        <h2 id="about-historical" className="text-base font-semibold text-fg">
          About this analysis
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-secondary">
          Every number on this page is calculated in code from daily closing prices supplied by one exchange data provider (shown on each panel with its date range and fetch time). Data from different providers is never
          stitched together, invalid or duplicate candles are removed and flagged, and missing days are never interpolated. Statistics always state their sample size, and small samples are flagged.
        </p>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {QUESTIONS.map(([q, a]) => (
            <div key={q}>
              <dt className="text-sm font-medium text-fg">{q}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-fg-muted">
          Historical patterns describe the past. They do not imply that cycles, seasonal tendencies, reaction zones or analogues will repeat, and nothing here is a price prediction or investment advice.
        </p>
      </section>
      <Disclaimer short className="mt-6" />
    </article>
  );
}
