"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getXrplClient, type XrplClient, type XrplConnState } from "./client";
import { getStreamHub, type SessionSnapshot, type StreamName } from "./streamHub";
import type { ServerInfoResult } from "./types";

/** Live connection state of the shared browser XRPL client. */
export function useXrplConnection(): { state: XrplConnState; server: string | null } {
  const [s, setS] = useState<{ state: XrplConnState; server: string | null }>({ state: "idle", server: null });
  useEffect(() => {
    const c = getXrplClient();
    setS({ state: c.state, server: c.server });
    const off = c.onState((state, server) => setS({ state, server: server ?? c.server }));
    return () => {
      off();
    };
  }, []);
  return s;
}

/** Subscribe to the shared session (ledger/transactions streams). */
export function useXrplSession(streams: StreamName[]): SessionSnapshot & { retry: () => void } {
  const hub = getStreamHub();
  const key = streams.slice().sort().join(",");
  useEffect(() => {
    const release = hub.acquire(key.split(",").filter(Boolean) as StreamName[]);
    return release;
  }, [hub, key]);
  const snap = useSyncExternalStore(hub.subscribeStore, hub.getSnapshot, hub.getSnapshot);
  return useMemo(() => ({ ...snap, retry: () => hub.retry() }), [snap, hub]);
}

export interface QueryState<T> {
  data: T | undefined;
  error: (Error & { code?: string }) | null;
  loading: boolean;
  updatedAt: number | null;
  server: string | null;
  reload: () => void;
}

/**
 * Run an XRPL request (or a composition of requests) with loading/error/retry state.
 * `key` null disables the query. The fetcher receives the shared browser client.
 */
export function useXrplQuery<T>(key: string | null, fetcher: (c: XrplClient) => Promise<T>, opts: { refreshMs?: number } = {}): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<(Error & { code?: string }) | null>(null);
  const [loading, setLoading] = useState<boolean>(!!key);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(key);
  keyRef.current = key;
  const seq = useRef(0);

  const run = useCallback(async () => {
    if (!key) return;
    const my = ++seq.current;
    setLoading(true);
    const c = getXrplClient();
    try {
      const d = await fetcherRef.current(c);
      if (my !== seq.current || keyRef.current !== key) return;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (my !== seq.current || keyRef.current !== key) return;
      setError(e as Error & { code?: string });
    } finally {
      if (my === seq.current) {
        setServer(c.server);
        setLoading(false);
      }
    }
  }, [key]);

  useEffect(() => {
    setData(undefined);
    setError(null);
    if (!key) {
      setLoading(false);
      return;
    }
    void run();
    if (!opts.refreshMs) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void run();
    }, opts.refreshMs);
    return () => clearInterval(id);
  }, [key, run, opts.refreshMs]);

  return { data, error, loading, updatedAt, server, reload: () => void run() };
}

/** server_info of the connected XRPL server (network stats, reserves). */
export function useServerInfo(refreshMs = 30_000) {
  return useXrplQuery<ServerInfoResult>("server_info", (c) => c.request<ServerInfoResult>("server_info"), { refreshMs });
}

/** Human name for a server URL from the shared list. */
export function serverName(url: string | null | undefined): string {
  if (!url) return "not connected";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
