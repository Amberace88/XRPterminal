"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * Account-level settings that are not part of the shared Preferences provider
 * (interests, notification categories, privacy/social, AI preferences). Guest mode:
 * browser storage. Signed in: mirrored to profiles.preferences.platform (+ social_visibility).
 */
export const INTERESTS = [
  { id: "market", label: "XRP market" },
  { id: "xrpl", label: "XRP Ledger" },
  { id: "portfolio", label: "Portfolio" },
  { id: "tradelab", label: "Trading simulation" },
  { id: "whales", label: "Whales" },
  { id: "news", label: "News" },
  { id: "ai", label: "AI intelligence" },
  { id: "historical", label: "Historical research" },
] as const;
export type InterestId = (typeof INTERESTS)[number]["id"];

export const NOTIFICATION_CATEGORIES = [
  { id: "market", label: "Market alerts", description: "Price levels, percentage moves and regime changes you set up." },
  { id: "wallet", label: "Wallet activity", description: "Activity on wallets you track, including whale thresholds." },
  { id: "news", label: "News", description: "Important news matching your interests." },
  { id: "forecast", label: "Forecasts", description: "New scenario publications and forecast changes." },
  { id: "tradelab", label: "Trade Lab", description: "Simulated order fills, stops and challenge results." },
  { id: "social", label: "Social", description: "Replies, follows and moderation outcomes (beta)." },
] as const;
export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORIES)[number]["id"];

export type SocialVisibility = "public" | "followers" | "private";

export interface PlatformSettings {
  interests: InterestId[];
  notifications: Record<NotificationCategoryId, boolean>;
  /** Security notices are always on; this toggle only controls sound/desktop surfacing in the future. */
  socialVisibility: SocialVisibility;
  showOnLeaderboards: boolean;
  aiDetail: "concise" | "detailed";
  aiIncludeSpeculation: boolean;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  interests: [],
  notifications: { market: true, wallet: true, news: false, forecast: true, tradelab: true, social: false },
  socialVisibility: "private",
  showOnLeaderboards: false,
  aiDetail: "concise",
  aiIncludeSpeculation: false,
};

const KEY = "platform-settings";

export function readPlatformSettings(): PlatformSettings {
  const raw = readLocal<Partial<PlatformSettings>>(KEY, {});
  return { ...DEFAULT_PLATFORM_SETTINGS, ...raw, notifications: { ...DEFAULT_PLATFORM_SETTINGS.notifications, ...(raw.notifications ?? {}) } };
}

export function writePlatformSettings(s: PlatformSettings) {
  writeLocal(KEY, s);
}

/** Persist to the signed-in profile (merging into preferences jsonb). */
export async function syncPlatformSettingsToProfile(userId: string, s: PlatformSettings): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = { ...((data?.preferences as Record<string, unknown> | null) ?? {}), platform: s };
  const { error } = await sb.from("profiles").update({ preferences: prefs, social_visibility: s.socialVisibility }).eq("id", userId);
  return error ? error.message : null;
}

function usePlatformSettingsState() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettings(readPlatformSettings());
    setHydrated(true);
  }, []);

  // When signed in, the account copy wins (it follows the user across devices).
  useEffect(() => {
    if (!user) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    let cancelled = false;
    sb.from("profiles")
      .select("preferences, social_visibility")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const remote = (data.preferences as { platform?: Partial<PlatformSettings> } | null)?.platform;
        if (remote) {
          const merged: PlatformSettings = {
            ...DEFAULT_PLATFORM_SETTINGS,
            ...remote,
            notifications: { ...DEFAULT_PLATFORM_SETTINGS.notifications, ...(remote.notifications ?? {}) },
            socialVisibility: (data.social_visibility as SocialVisibility) ?? remote.socialVisibility ?? "private",
          };
          setSettings(merged);
          writePlatformSettings(merged);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(
    (patch: Partial<PlatformSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        writePlatformSettings(next);
        if (user) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            syncPlatformSettingsToProfile(user.id, next).then(setSyncError);
          }, 600);
        }
        return next;
      });
    },
    [user],
  );

  return { settings, update, hydrated, syncError };
}

type PlatformSettingsCtx = ReturnType<typeof usePlatformSettingsState>;
const Ctx = createContext<PlatformSettingsCtx | null>(null);

/** Share one settings state across all settings sections on a page. */
export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const value = usePlatformSettingsState();
  return createElement(Ctx.Provider, { value }, children);
}

export function usePlatformSettings(): PlatformSettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlatformSettings must be used inside PlatformSettingsProvider");
  return c;
}
