"use client";

import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatPrice } from "@/lib/format";
import { FeesCalc, PercentCalc, PnlCalc, PositionSizeCalc, RiskRewardCalc, SlippageCalc } from "./TradingCalcs";
import { CompoundCalc, DcaCalc, DrawdownCalc, MarketCapCalc, PortfolioScenarioCalc, ScenarioCalc } from "./PortfolioCalcs";

const TOC = [
  ["pnl", "P&L"],
  ["percent", "% change"],
  ["position-size", "Position size"],
  ["risk-reward", "Risk/reward"],
  ["compound", "Compound"],
  ["drawdown", "Drawdown"],
  ["portfolio", "Portfolio"],
  ["dca", "DCA"],
  ["fees", "Fees"],
  ["slippage", "Slippage"],
  ["market-cap", "Market cap"],
  ["scenario", "Scenario"],
] as const;

export function CalculatorsPage() {
  const { ticker, status, streaming } = useMarket();
  const price = ticker?.price ?? null;
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Calculators"
        description="Deterministic trading and portfolio math. Prices prefill from the live XRP/USD ticker — every field is editable."
        actions={
          <span className="flex items-center gap-2 text-xs text-fg-secondary">
            XRP {formatPrice(price)} <DataFreshness status={status} provenance={ticker?.provenance} streaming={streaming} />
          </span>
        }
      />
      <nav aria-label="Calculators" className="sticky top-0 z-10 -mx-4 mb-4 overflow-x-auto border-b border-border-subtle bg-bg/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-2">
        <ul className="flex gap-1">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-4 lg:grid-cols-2">
        <PnlCalc price={price} />
        <PercentCalc price={price} />
        <PositionSizeCalc price={price} />
        <RiskRewardCalc price={price} />
        <CompoundCalc />
        <DrawdownCalc price={price} />
        <PortfolioScenarioCalc price={price} />
        <DcaCalc price={price} />
        <FeesCalc price={price} />
        <SlippageCalc price={price} />
        <MarketCapCalc price={price} />
        <ScenarioCalc price={price} />
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
