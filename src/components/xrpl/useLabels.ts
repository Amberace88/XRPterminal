"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";
import { indexLabels, type LabelCategory, type LabelIndex, type WalletLabel } from "@/lib/xrpl/labels";
import { getUserLabelRepo } from "@/lib/xrpl/userLabels";

export interface LabelsApiResponse {
  available: boolean;
  stale: boolean;
  error: string | null;
  source: string;
  sourceUrl: string;
  fetchedAt: number | null;
  count: number;
  labels: WalletLabel[];
}

/**
 * Label index: XRPScan well-known names (server-cached 24h) + the user's own labels.
 * Degrades gracefully: when the external source is down, only user labels are shown.
 */
export function useLabels(): {
  index: LabelIndex;
  wellKnown: { available: boolean; loading: boolean; error: string | null; fetchedAt: number | null; count: number };
  userLabels: WalletLabel[];
  saveUserLabel: (address: string, name: string, category?: LabelCategory) => Promise<void>;
  removeUserLabel: (address: string) => Promise<void>;
  storage: "local" | "account";
} {
  const { user } = useAuth();
  const wk = useApi<LabelsApiResponse>("/api/xrpl/labels", { staleMs: 6 * 3_600_000 });
  const repo = useMemo(() => getUserLabelRepo(user?.id ?? null), [user?.id]);
  const [userLabels, setUserLabels] = useState<WalletLabel[]>([]);

  const refresh = useCallback(() => {
    repo
      .list()
      .then(setUserLabels)
      .catch(() => setUserLabels([]));
  }, [repo]);

  useEffect(() => {
    refresh();
    const on = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === "xrpl:userLabels") refresh();
    };
    window.addEventListener("xrpt-storage", on);
    window.addEventListener("xrpt-user-labels", on);
    return () => {
      window.removeEventListener("xrpt-storage", on);
      window.removeEventListener("xrpt-user-labels", on);
    };
  }, [refresh]);

  const index = useMemo(() => indexLabels(wk.data?.labels ?? [], userLabels), [wk.data, userLabels]);

  const notify = () => {
    try {
      window.dispatchEvent(new CustomEvent("xrpt-user-labels", { detail: { key: "xrpl:userLabels" } }));
    } catch {
      /* ignore */
    }
  };

  return {
    index,
    wellKnown: {
      available: !!wk.data?.available,
      loading: wk.loading && !wk.data,
      error: wk.error?.message ?? wk.data?.error ?? null,
      fetchedAt: wk.data?.fetchedAt ?? null,
      count: wk.data?.count ?? 0,
    },
    userLabels,
    saveUserLabel: async (a, n, c) => {
      await repo.save(a, n, c);
      refresh();
      notify();
    },
    removeUserLabel: async (a) => {
      await repo.remove(a);
      refresh();
      notify();
    },
    storage: repo.persistent,
  };
}
