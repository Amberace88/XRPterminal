import type { Metadata } from "next";
import { TradeLabShell } from "@/components/tradelab/TradeLabShell";

export const metadata: Metadata = {
  title: { default: "Trade Lab (simulated)", template: "%s · Trade Lab (simulated)" },
  description: "Paper trading with virtual capital against real XRP market data. Everything is simulated — no real orders, no real money.",
};

export default function TradeLabLayout({ children }: { children: React.ReactNode }) {
  return <TradeLabShell>{children}</TradeLabShell>;
}
