import type { Metadata } from "next";
import { SocialPage } from "@/components/social/SocialPage";

export const metadata: Metadata = { title: "Social Intelligence (Beta) — XRP Terminal", description: "Verified XRPL traders, news-derived headline sentiment and scam protection." };

export default function Page() {
  return <SocialPage />;
}
