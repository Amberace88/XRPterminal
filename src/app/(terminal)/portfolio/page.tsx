import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = {
  title: "Portfolio | XRP Terminal",
  description: "Private, read-only XRP portfolio across public XRPL wallets and read-only exchange keys.",
  robots: { index: false, follow: false },
};

export default function PortfolioPage() {
  return <PortfolioView />;
}
