import type { Metadata } from "next";
import { MarketProvider } from "@/components/providers/MarketProvider";
import { TerminalShell } from "@/components/shell/TerminalShell";
import { AlertEngineMount } from "@/components/alerts/AlertEngineMount";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <AlertEngineMount />
      <TerminalShell>{children}</TerminalShell>
    </MarketProvider>
  );
}
