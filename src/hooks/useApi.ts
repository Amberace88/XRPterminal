"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny SWR-like hook for our own JSON API routes ({ok,data}|{ok:false,error}).
 * - in-memory cache shared across components (keyed by URL)
 * - optional polling
 * - explicit loading / error / data states (spec §176–178)
 */
type Entry = { data: unknown; at: number; promise?: Promise<unknown> };
const cache = new Map<string, Entry>();

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
  }
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  let body: { ok: boolean; data?: T; error?: { code: string; message: string; retryable?: boolean } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", `Unexpected response (${res.status})`, res.status, true);
  }
  if (!body.ok) throw new ApiError(body.error?.code ?? "ERROR", body.error?.message ?? "Request failed", res.status, body.error?.retryable);
  return body.data as T;
}

export async function apiPost<T>(url: string, payload: unknown, method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return apiGet<T>(url, { method, body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
}

export function useApi<T>(
  url: string | null,
  opts: { refreshMs?: number; staleMs?: number; keepPrevious?: boolean } = {},
): { data: T | undefined; error: ApiError | null; loading: boolean; updatedAt: number | null; reload: () => void } {
  const { refreshMs, staleMs = 30_000, keepPrevious = true } = opts;
  const cached = url ? (cache.get(url) as Entry | undefined) : undefined;
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cached?.at ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url && !cached);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(
    async (force = false) => {
      if (!url) return;
      const entry = cache.get(url);
      if (!force && entry && Date.now() - entry.at < staleMs) {
        setData(entry.data as T);
        setUpdatedAt(entry.at);
        setLoading(false);
        return;
      }
      if (!keepPrevious) setData(undefined);
      setLoading(true);
      try {
        let p = entry?.promise;
        if (!p || force) {
          p = apiGet<T>(url);
          cache.set(url, { data: entry?.data, at: entry?.at ?? 0, promise: p });
        }
        const d = (await p) as T;
        const at = Date.now();
        cache.set(url, { data: d, at });
        if (urlRef.current === url) {
          setData(d);
          setUpdatedAt(at);
          setError(null);
        }
      } catch (e) {
        const c = cache.get(url);
        if (c) cache.set(url, { data: c.data, at: c.at });
        if (urlRef.current === url) setError(e instanceof ApiError ? e : new ApiError("NETWORK", (e as Error).message, 0, true));
      } finally {
        if (urlRef.current === url) setLoading(false);
      }
    },
    [url, staleMs, keepPrevious],
  );

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const c = cache.get(url);
    if (c?.data !== undefined) {
      setData(c.data as T);
      setUpdatedAt(c.at);
    }
    load();
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load(true);
    }, refreshMs);
    return () => clearInterval(id);
  }, [url, refreshMs, load]);

  return { data, error, loading, updatedAt, reload: () => load(true) };
}
