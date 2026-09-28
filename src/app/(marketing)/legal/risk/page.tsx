import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { LEGAL_DISCLAIMER } from "@/lib/config";

export const metadata: Metadata = {
  title: "Risk Disclosure",
  description: "Crypto-asset risk disclosure: volatility, liquidity, loss of capital, model uncertainty, limits of historical data and of simulation.",
  alternates: { canonical: "/legal/risk" },
};

const sections: LegalSection[] = [
  {
    id: "volatility",
    title: "Volatility",
    content: (
      <p>
        Crypto-assets, including XRP, are highly volatile. Prices can move by large percentages within hours or minutes, trade 24 hours a day and can fall sharply
        without warning. Past drawdowns of more than 80% from previous highs have occurred and may occur again.
      </p>
    ),
  },
  {
    id: "loss",
    title: "Risk of loss",
    content: (
      <p>
        You may lose some or all of the capital you invest in crypto-assets. Only use money you can afford to lose. Leverage and derivative products, where you use
        them elsewhere, can cause losses larger than your initial deposit.
      </p>
    ),
  },
  {
    id: "liquidity",
    title: "Liquidity",
    content: (
      <p>
        Liquidity varies across venues, trading pairs and times of day. In thin markets, orders can be filled at prices far from the last quoted price, and it may
        be impossible to exit a position at the price you expect. Exchanges may halt trading, deposits or withdrawals.
      </p>
    ),
  },
  {
    id: "model",
    title: "Model uncertainty",
    content: (
      <p>
        Scenario ranges, regime classifications, risk scores and other model outputs are simplifications based on assumptions and historical data. They can be
        wrong, can change as new data arrives, and cannot account for unprecedented events. A scenario range is not a prediction, and outcomes outside any
        displayed range are possible.
      </p>
    ),
  },
  {
    id: "historical",
    title: "Limits of historical data",
    content: (
      <p>
        Historical statistics are drawn from a limited number of market cycles and from data sources that may contain gaps, errors or venue-specific distortions.
        Market structure, participants and regulation change over time. Historical results do not guarantee future results.
      </p>
    ),
  },
  {
    id: "simulation",
    title: "Limits of simulation",
    content: (
      <p>
        Paper trading, historical replay and backtests use models of order execution, fees and slippage. They do not reproduce real liquidity, order-book
        dynamics, outages or the psychological pressure of real money. Simulated performance can differ materially from live results and does not guarantee
        future results.
      </p>
    ),
  },
  {
    id: "data",
    title: "Data and technology risk",
    content: (
      <p>
        Data can be delayed, incomplete or incorrect, and connections to data sources can fail. Always check the source and freshness indicators before relying
        on a figure. Blockchain networks and third-party services can experience outages, bugs or attacks.
      </p>
    ),
  },
  {
    id: "regulatory",
    title: "Regulatory, counterparty and tax risk",
    content: (
      <p>
        The legal and regulatory treatment of crypto-assets differs by country and can change quickly, affecting prices, availability and the services you can
        use. Assets held with third parties such as exchanges are exposed to their solvency and security. Transactions may have tax consequences — seek advice
        from a qualified professional.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI output",
    content: (
      <p>
        AI-generated explanations and summaries can contain errors or omissions. Check the cited sources before relying on any AI statement. AI output is never
        investment advice.
      </p>
    ),
  },
  {
    id: "no-advice",
    title: "No investment advice",
    content: <p>{LEGAL_DISCLAIMER}</p>,
  },
];

export default function RiskPage() {
  return (
    <LegalPage
      current="/legal/risk"
      title="Risk Disclosure"
      intro={<p>Please read this disclosure carefully. It describes the main risks of crypto-assets and of relying on analytics, models and simulations.</p>}
      sections={sections}
    />
  );
}
