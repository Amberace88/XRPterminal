import type { Metadata } from "next";
import { PerformanceView } from "@/components/tradelab/PerformanceView";

export const metadata: Metadata = { title: "Performance" };

export default function TradeLabPerformancePage() {
  return <PerformanceView />;
}
