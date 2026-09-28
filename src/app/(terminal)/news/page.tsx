import type { Metadata } from "next";
import { NewsPage } from "@/components/news/NewsPage";

export const metadata: Metadata = { title: "News — XRP Terminal", description: "Clustered XRP, XRPL, Ripple and RLUSD headlines with source links, event intelligence and headline sentiment." };

export default function Page() {
  return <NewsPage />;
}
