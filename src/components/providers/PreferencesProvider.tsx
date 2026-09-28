"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage/local";
import type { Fiat } from "@/lib/types/market";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface Preferences {
  currency: Fiat;
  timezone: string; // IANA, "" = browser default
  theme: "dark" | "light";
  locale: Locale;
  reducedMotion: boolean;
  onboardingDone: boolean;
  dashboardLayout: string[]; // ordered widget ids
  hiddenWidgets: string[];
}

const DEFAULTS: Preferences = {
  currency: "USD",
  timezone: "",
  theme: "dark",
  locale: "en",
  reducedMotion: false,
  onboardingDone: false,
  dashboardLayout: [],
  hiddenWidgets: [],
};

interface Ctx {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void;
  tz: string | undefined;
  hydrated: boolean;
}

const PrefsContext = createContext<Ctx | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs({ ...DEFAULTS, ...readLocal<Partial<Preferences>>("prefs", {}) });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.lang = prefs.locale;
  }, [prefs.theme, prefs.locale, hydrated]);

  const setPref = useCallback(<K extends keyof Preferences>(k: K, v: Preferences[K]) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      writeLocal("prefs", next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, setPref, tz: prefs.timezone || undefined, hydrated }), [prefs, setPref, hydrated]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePreferences(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error("usePreferences must be used inside PreferencesProvider");
  return c;
}
