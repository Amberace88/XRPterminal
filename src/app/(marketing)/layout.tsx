import { isSupabaseConfigured } from "@/lib/config";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingShell } from "@/components/marketing/MarketingShell";

/** Public site chrome: sticky translucent header, footer, motion + referral capture. Indexed. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const accountsEnabled = isSupabaseConfigured();
  return (
    <MarketingShell>
      <div className="flex min-h-screen flex-col bg-bg">
        <MarketingHeader accountsEnabled={accountsEnabled} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <MarketingFooter />
      </div>
    </MarketingShell>
  );
}
