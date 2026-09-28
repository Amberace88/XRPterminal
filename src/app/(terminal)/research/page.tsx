import type { Metadata } from "next";
import { ResearchHub } from "@/components/research/ResearchHub";

export const metadata: Metadata = { title: "Research — XRP Terminal", description: "Research hub and printable XRP market research reports with methodology and sources." };

export default function Page() {
  return <ResearchHub />;
}
