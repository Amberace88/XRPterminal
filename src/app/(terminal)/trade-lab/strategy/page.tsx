import type { Metadata } from "next";
import { StrategyView } from "@/components/tradelab/StrategyView";

export const metadata: Metadata = { title: "Strategy Lab" };

export default function TradeLabStrategyPage() {
  return <StrategyView />;
}
