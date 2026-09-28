import type { Metadata } from "next";
import { TerminalView } from "@/components/tradelab/TerminalView";

export const metadata: Metadata = { title: "Terminal" };

export default function TradeLabPage() {
  return <TerminalView />;
}
