import type { Metadata } from "next";
import { ChallengesView } from "@/components/tradelab/ChallengesView";

export const metadata: Metadata = { title: "Challenges" };

export default function TradeLabChallengesPage() {
  return <ChallengesView />;
}
