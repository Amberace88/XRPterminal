"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ALERTS_CHANGED_EVENT, WATCHLIST_CHANGED_EVENT, getAlertsRepo, getWatchlistRepo } from "@/lib/alerts/repo";
import { DEFAULT_CHANNEL_SETTINGS, type AlertEvent, type AlertRule, type ChannelSettings, type WatchItem } from "@/lib/alerts/types";

/** Loads alert rules / history / channel settings from the active repo (guest storage or Supabase). */
export function useAlerts() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const repo = useMemo(() => getAlertsRepo(userId), [userId]);
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [settings, setSettings] = useState<ChannelSettings>(DEFAULT_CHANNEL_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const [r, e, s] = await Promise.all([repo.listRules(), repo.listEvents(200), repo.getSettings()]);
      setRules(r);
      setEvents(e);
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load alerts");
      setRules((r) => r ?? []);
      setEvents((x) => x ?? []);
    }
  }, [repo, authLoading]);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener(ALERTS_CHANGED_EVENT, h);
    return () => window.removeEventListener(ALERTS_CHANGED_EVENT, h);
  }, [load]);

  return { repo, rules, events, settings, error, reload: load, loading: rules === null, mode: repo.mode };
}

export function useWatchlist() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const repo = useMemo(() => getWatchlistRepo(userId), [userId]);
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      setItems(await repo.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load watchlist");
      setItems((x) => x ?? []);
    }
  }, [repo, authLoading]);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener(WATCHLIST_CHANGED_EVENT, h);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, h);
  }, [load]);
  return { repo, items, error, reload: load, loading: items === null, mode: repo.mode };
}
