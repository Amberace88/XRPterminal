import type { Metadata } from "next";
import { CalculatorsPage } from "@/components/calculators/CalculatorsPage";

export const metadata: Metadata = { title: "Calculators — XRP Terminal", description: "P&L, position size, risk/reward, DCA, drawdown, fees, slippage, market cap and scenario calculators." };

export default function Page() {
  return <CalculatorsPage />;
}
