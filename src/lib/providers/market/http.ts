import { ProviderError } from "./types";

/**
 * fetch with timeout + bounded exponential backoff retry for transient errors (spec §309).
 * `revalidate` uses the Next.js data cache on the server (spec §149).
 */
export async function fetchJson<T>(
  provider: string,
  url: string,
  opts: { timeoutMs?: number; retries?: number; revalidate?: number | false; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 8000, retries = 1, revalidate = 60, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init: RequestInit & { next?: { revalidate: number | false } } = {
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": "XRPTerminal/1.0 (+https://xrpterminal.com)", ...headers },
      };
      if (typeof window === "undefined") init.next = { revalidate };
      const res = await fetch(url, init);
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const err = new ProviderError(provider, `HTTP ${res.status}`, res.status);
        if (!retryable) throw err;
        lastErr = err;
      } else {
        return (await res.json()) as T;
      }
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError && e.status && e.status < 500 && e.status !== 429) throw e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  if (lastErr instanceof ProviderError) throw lastErr;
  throw new ProviderError(provider, lastErr instanceof Error ? lastErr.message : "request failed");
}
