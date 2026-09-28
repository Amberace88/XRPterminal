import type { Metadata } from "next";
import { AiIntelligence } from "@/components/ai/AiIntelligence";

export const metadata: Metadata = { title: "AI Intelligence — XRP Terminal", description: "Data-grounded daily and weekly XRP briefs with labelled facts, analysis and scenarios." };

export default function Page() {
  return <AiIntelligence />;
}
