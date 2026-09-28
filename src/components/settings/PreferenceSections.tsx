"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Moon, Sun, Wallet } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { planOf } from "@/lib/entitlements";
import { readLocal } from "@/lib/storage/local";
import { formatDateTime } from "@/lib/format";
import type { Fiat } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, normalizeConsent } from "@/components/marketing/consent";
import { NOTIFICATION_CATEGORIES, usePlatformSettings, type SocialVisibility } from "./platformSettings";
import { GuestNotice, SettingRow, SettingsSection } from "./SettingsSection";

/** Mirror core preferences to the profile row when signed in (so they follow the account). */
function useProfileSync() {
  const { user } = useAuth();
  return (patch: Partial<{ currency: Fiat; timezone: string; locale: Locale }>) => {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    void sb.from("profiles").update(patch).eq("id", user.id);
  };
}

/* ------------------------------------------------------------------ Notifications */
export function NotificationsSection() {
  const { settings, update, hydrated } = usePlatformSettings();
  return (
    <SettingsSection id="notifications" title="Notifications" description="Choose which categories reach your in-app notification center. Alerts you create always respect cooldowns and daily caps.">
      <div className="space-y-1">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <SettingRow key={c.id} label={c.label} description={c.description}>
            <Switch
              label={c.label}
              disabled={!hydrated}
              checked={settings.notifications[c.id]}
              onChange={(v) => update({ notifications: { ...settings.notifications, [c.id]: v } })}
            />
          </SettingRow>
        ))}
        <SettingRow label="Security notices" description="New sign-ins, password changes and account deletion requests. Always on.">
          <Switch label="Security notices" checked disabled onChange={() => undefined} />
        </SettingRow>
        <SettingRow label="Email delivery" description="Alerts are delivered in-app today. Email delivery is not yet available.">
          <Badge tone="neutral">Not yet available</Badge>
        </SettingRow>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Appearance */
export function AppearanceSection() {
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  return (
    <SettingsSection id="appearance" title="Appearance" description="Theme and motion. XRP Terminal also respects your operating system's reduced-motion setting.">
      <div className="grid max-w-md grid-cols-2 gap-3">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={prefs.theme === t}
            onClick={() => setPref("theme", t)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              prefs.theme === t ? "border-accent/60 bg-accent/10" : "border-border-subtle hover:border-border",
            )}
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-border-subtle bg-bg-secondary text-fg">
              {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </span>
            <span className="text-sm font-medium capitalize text-fg">{t}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-1">
        <SettingRow label="Reduce motion" description="Minimise animations throughout the app.">
          <Switch label="Reduce motion" checked={prefs.reducedMotion} onChange={(v) => setPref("reducedMotion", v)} />
        </SettingRow>
        <SettingRow label="Onboarding tour" description="Show the quick product tour again on your dashboard.">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setPref("onboardingDone", false);
              router.push("/dashboard");
            }}
          >
            Replay tour
          </Button>
        </SettingRow>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Language */
export function LanguageSection() {
  const { prefs, setPref } = usePreferences();
  const sync = useProfileSync();
  return (
    <SettingsSection id="language" title="Language" description="Navigation and shared interface text are translated. Some pages are available in English only for now.">
      <SettingRow label="Interface language">
        <select
          className="select h-9 w-48"
          aria-label="Interface language"
          value={prefs.locale}
          onChange={(e) => {
            const l = e.target.value as Locale;
            setPref("locale", l);
            sync({ locale: l });
          }}
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </SettingRow>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Currency */
export function CurrencySection() {
  const { prefs, setPref } = usePreferences();
  const sync = useProfileSync();
  return (
    <SettingsSection id="currency" title="Currency" description="Display currency for prices and portfolio values. Conversions use European Central Bank reference rates, and the rate source is shown next to converted values.">
      <Tabs
        ariaLabel="Display currency"
        size="md"
        value={prefs.currency}
        onChange={(c) => {
          setPref("currency", c);
          sync({ currency: c });
        }}
        items={(["USD", "EUR", "GBP"] as Fiat[]).map((c) => ({ value: c, label: c }))}
      />
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Timezone */
export function TimezoneSection() {
  const { prefs, setPref } = usePreferences();
  const sync = useProfileSync();
  const [zones, setZones] = useState<string[]>([]);
  const [browserTz, setBrowserTz] = useState<string>("UTC");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    setZones(intl.supportedValuesOf?.("timeZone") ?? ["UTC", "Europe/London", "Europe/Madrid", "Europe/Riga", "America/New_York", "Asia/Tokyo"]);
    setBrowserTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const effective = prefs.timezone || browserTz;
  return (
    <SettingsSection id="timezone" title="Timezone" description="Used for displaying dates and times. Candles and daily statistics are always calculated in UTC.">
      <SettingRow label="Display timezone" description={now ? `Now: ${formatDateTime(now, effective)}` : undefined}>
        <select
          className="select h-9 w-64"
          aria-label="Display timezone"
          value={prefs.timezone}
          onChange={(e) => {
            setPref("timezone", e.target.value);
            sync({ timezone: e.target.value || "UTC" });
          }}
        >
          <option value="">Browser default ({browserTz})</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </SettingRow>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Connected accounts */
export function ConnectedAccountsSection() {
  const { plan } = useAuth();
  const limit = planOf(plan).limits.connectedAccounts;
  return (
    <SettingsSection id="connected" title="Connected accounts" description="Public XRPL addresses and read-only exchange connections are managed in Portfolio.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="text-xs leading-relaxed text-fg-secondary">
            <p>
              Your plan allows <span className="num font-medium text-fg">{Number.isFinite(limit) ? limit : "unlimited"}</span> connected account{limit === 1 ? "" : "s"}.
            </p>
            <p className="mt-1">Read-only only: never provide keys with trading or withdrawal permissions, and never a seed phrase or private key.</p>
          </div>
        </div>
        <ButtonLink href="/portfolio" size="sm" variant="secondary">
          Manage in Portfolio <ArrowRight className="h-3.5 w-3.5" />
        </ButtonLink>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Privacy */
const VISIBILITY: { value: SocialVisibility; label: string; description: string }[] = [
  { value: "private", label: "Private", description: "Only you can see your profile and simulated performance." },
  { value: "followers", label: "Followers", description: "People who follow you can see your public profile." },
  { value: "public", label: "Public", description: "Anyone can view your public profile and verified results." },
];

export function PrivacySection() {
  const { settings, update, hydrated } = usePlatformSettings();
  const { user } = useAuth();
  const [consent, setConsent] = useState(() => normalizeConsent(null));
  useEffect(() => {
    const load = () => setConsent(normalizeConsent(readLocal(CONSENT_STORAGE_KEY, null)));
    load();
    window.addEventListener("xrpt-storage", load);
    return () => window.removeEventListener("xrpt-storage", load);
  }, []);
  return (
    <SettingsSection id="privacy" title="Privacy" description="Control who sees your profile and which optional data you share. Portfolio values are never public unless you explicitly publish them.">
      <fieldset disabled={!hydrated}>
        <legend className="mb-2 text-sm text-fg">Social profile visibility</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {VISIBILITY.map((v) => (
            <label
              key={v.value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors",
                settings.socialVisibility === v.value ? "border-accent/60 bg-accent/10" : "border-border-subtle hover:border-border",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                <input type="radio" name="visibility" className="accent-[rgb(var(--accent))]" checked={settings.socialVisibility === v.value} onChange={() => update({ socialVisibility: v.value })} />
                {v.label}
              </span>
              <span className="text-xs leading-relaxed text-fg-muted">{v.description}</span>
            </label>
          ))}
        </div>
        {!user && <p className="mt-2 text-2xs text-fg-muted">In guest mode you have no public profile; this choice is applied when you create an account.</p>}
      </fieldset>
      <div className="mt-4 space-y-1">
        <SettingRow
          label="Cookies & analytics"
          description={
            consent.decidedAt
              ? `Analytics ${consent.analytics ? "allowed" : "off"} · Marketing ${consent.marketing ? "allowed" : "off"}`
              : "No choice recorded — only strictly necessary storage is used."
          }
        >
          <Button size="sm" variant="secondary" onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}>
            Cookie settings
          </Button>
        </SettingRow>
        <SettingRow label="Privacy Policy" description="What we collect, why, and your rights.">
          <Link href="/legal/privacy" className="text-sm text-accent-strong hover:underline">
            Read policy
          </Link>
        </SettingRow>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Social */
export function SocialSection() {
  const { settings, update, hydrated } = usePlatformSettings();
  return (
    <SettingsSection id="social" title="Social" description="How you appear in Social Intelligence (beta). Simulated performance is always labelled as simulated.">
      <div className="space-y-1">
        <SettingRow label="Show me on paper-trading leaderboards" description="Displays your display name and simulated statistics. Requires a public or followers-only profile.">
          <Switch
            label="Show on leaderboards"
            disabled={!hydrated || settings.socialVisibility === "private"}
            checked={settings.showOnLeaderboards && settings.socialVisibility !== "private"}
            onChange={(v) => update({ showOnLeaderboards: v })}
          />
        </SettingRow>
        <SettingRow label="Social feed" description="Follow verified traders, read sentiment and report scams.">
          <Link href="/social" className="text-sm text-accent-strong hover:underline">
            Open Social
          </Link>
        </SettingRow>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ AI preferences */
export function AiPreferencesSection() {
  const { settings, update, hydrated } = usePlatformSettings();
  const detail = useMemo(() => settings.aiDetail, [settings.aiDetail]);
  return (
    <SettingsSection id="ai" title="AI preferences" description="How AI briefs and answers are written. AI never produces the numbers — it explains results calculated by code.">
      <div className="space-y-1">
        <SettingRow label="Answer length">
          <Tabs
            ariaLabel="AI answer length"
            value={detail}
            onChange={(v) => update({ aiDetail: v })}
            items={[
              { value: "concise", label: "Concise", disabled: !hydrated },
              { value: "detailed", label: "Detailed", disabled: !hydrated },
            ]}
          />
        </SettingRow>
        <SettingRow label="Include clearly-labelled speculation" description="When off, AI answers stick to facts, analysis and scenarios.">
          <Switch label="Include speculation" disabled={!hydrated} checked={settings.aiIncludeSpeculation} onChange={(v) => update({ aiIncludeSpeculation: v })} />
        </SettingRow>
      </div>
    </SettingsSection>
  );
}

export { GuestNotice };
