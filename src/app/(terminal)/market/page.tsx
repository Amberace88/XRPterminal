import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketView } from "@/components/market/MarketView";
import { SkeletonRows } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "XRP Market — Live Price, Chart, Order Book & Market Health",
  description:
    "Live XRP/USD, XRP/EUR, XRP/BTC and XRP/ETH prices with professional charts, a live order book, recent trades, realized volatility and a data-driven market health module.",
};

export default function MarketPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <MarketView />
    </Suspense>
  );
}
