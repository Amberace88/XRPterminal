import type { Metadata } from "next";
import { ReplayView } from "@/components/tradelab/ReplayView";

export const metadata: Metadata = { title: "Historical Replay" };

export default function TradeLabReplayPage() {
  return <ReplayView />;
}
