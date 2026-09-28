"use client";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { translate, type DictKey } from "@/lib/i18n/dictionaries";

export function useT() {
  const { prefs } = usePreferences();
  return (key: DictKey) => translate(prefs.locale, key);
}
