import type { Metadata } from "next";
import { MarketProvider } from "@/components/providers/MarketProvider";
import { TerminalShell } from "@/components/shell/TerminalShell";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <TerminalShell>{children}</TerminalShell>
    </MarketProvider>
  );
}
