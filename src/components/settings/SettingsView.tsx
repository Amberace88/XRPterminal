"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/components/providers/AuthProvider";
import { useT } from "@/hooks/useT";
import { cn } from "@/lib/utils/cn";
import { AccountSection, BillingSection, DeleteAccountSection, SecuritySection } from "./AccountSections";
import {
  AiPreferencesSection,
  AppearanceSection,
  ConnectedAccountsSection,
  CurrencySection,
  LanguageSection,
  NotificationsSection,
  PrivacySection,
  SocialSection,
  TimezoneSection,
} from "./PreferenceSections";
import { DataExportSection } from "./DataExportSection";
import { PlatformSettingsProvider, usePlatformSettings } from "./platformSettings";

const NAV = [
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "language", label: "Language" },
  { id: "currency", label: "Currency" },
  { id: "timezone", label: "Timezone" },
  { id: "connected", label: "Connected accounts" },
  { id: "privacy", label: "Privacy" },
  { id: "social", label: "Social" },
  { id: "ai", label: "AI preferences" },
  { id: "billing", label: "Billing" },
  { id: "export", label: "Data export" },
  { id: "delete", label: "Delete account" },
];

function SyncStatus() {
  const { syncError } = usePlatformSettings();
  if (!syncError) return null;
  return <p className="rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs text-warning">Some settings could not be saved to your account ({syncError}). They are kept in this browser.</p>;
}

/** /settings — works fully in guest mode; syncs to the account when signed in. */
export function SettingsView() {
  const { user, loading } = useAuth();
  const t = useT();
  const [active, setActive] = useState("account");

  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <PlatformSettingsProvider>
      <PageHeader
        title="Settings"
        description="Account, preferences, privacy and data controls."
        badge={!loading && !user ? <Badge tone="warning">{t("common.guestMode")}</Badge> : undefined}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="min-w-0 sticky top-14 z-20 -mx-3 border-b border-border-subtle bg-bg/90 px-3 py-2 backdrop-blur lg:top-20 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  aria-current={active === n.id ? "true" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active === n.id ? "bg-accent/10 text-fg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
                    n.id === "delete" && active !== n.id && "text-danger/80",
                  )}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          <SyncStatus />
          <AccountSection />
          <SecuritySection />
          <NotificationsSection />
          <AppearanceSection />
          <LanguageSection />
          <CurrencySection />
          <TimezoneSection />
          <ConnectedAccountsSection />
          <PrivacySection />
          <SocialSection />
          <AiPreferencesSection />
          <BillingSection />
          <DataExportSection />
          <DeleteAccountSection />
        </div>
      </div>
    </PlatformSettingsProvider>
  );
}
