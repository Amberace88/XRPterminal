import type { Metadata } from "next";
import { AlertsPage } from "@/components/alerts/AlertsPage";

export const metadata: Metadata = { title: "Alerts & Watchlist — XRP Terminal", description: "Price, volatility, regime, wallet, whale, news and forecast alerts with anti-spam controls." };

export default function Page() {
  return <AlertsPage />;
}
