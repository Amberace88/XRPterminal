import "server-only";
import type { ProviderHealth, ProviderStatus } from "@/lib/types/market";
import { MARKET_PROVIDERS, TICKER_PRIORITY } from "@/lib/providers/market/registry";
import type { SupportedPair } from "@/lib/providers/market/types";
import { XRPL_SERVERS, XrplClient } from "@/lib/xrpl/client";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { isAiConfigured, isStripeConfigured } from "@/lib/server/env";

/**
 * Active provider health checks (spec §153, §237). Each check has its own short
 * timeout; results are never fabricated — a check we did not run is UNKNOWN.
 */

const CHECK_TIMEOUT = 6000;
/** Default news feed pinged for health. Override with NEWS_HEALTH_FEED_URL. */
export const DEFAULT_NEWS_HEALTH_FEED = "https://www.coindesk.com/arc/outboundfeeds/rss/";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

function latencyStatus(ms: number): ProviderStatus {
  return ms > 3500 ? "DEGRADED" : "HEALTHY";
}

async function checkMarket(id: string): Promise<ProviderHealth> {
  const p = MARKET_PROVIDERS[id];
  const pair = (p.pairs.includes("XRP-USD" as SupportedPair) ? "XRP-USD" : p.pairs.find((x) => x.startsWith("XRP"))) as SupportedPair;
  const t0 = Date.now();
  try {
    const tk = await withTimeout(p.getTicker(pair), CHECK_TIMEOUT, p.name);
    const ms = Date.now() - t0;
    if (!Number.isFinite(tk.price) || tk.price <= 0) throw new Error("invalid price in response");
    const ageS = Math.round((Date.now() - tk.provenance.timestamp) / 1000);
    const stale = ageS > 300;
    return {
      id,
      name: p.name,
      kind: "market",
      status: stale ? "DEGRADED" : latencyStatus(ms),
      latencyMs: ms,
      lastSuccess: Date.now(),
      message: `${pair} ticker OK${stale ? ` · data ${ageS}s old` : ""}`,
    };
  } catch (e) {
    return { id, name: p.name, kind: "market", status: "DOWN", latencyMs: Date.now() - t0, lastFailure: Date.now(), message: errMsg(e) };
  }
}

async function checkXrplServer(srv: (typeof XRPL_SERVERS)[number]): Promise<ProviderHealth> {
  const client = new XrplClient([srv]);
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      client.request<{ info?: { server_state?: string; validated_ledger?: { seq?: number; age?: number }; complete_ledgers?: string } }>("server_info", {}, CHECK_TIMEOUT),
      CHECK_TIMEOUT + 2000,
      srv.name,
    );
    const ms = Date.now() - t0;
    const info = res.info ?? {};
    const state = info.server_state ?? "unknown";
    const age = info.validated_ledger?.age ?? null;
    const synced = ["full", "proposing", "validating"].includes(state);
    const status: ProviderStatus = !synced ? "DEGRADED" : age !== null && age > 60 ? "DEGRADED" : latencyStatus(ms);
    return {
      id: `xrpl:${srv.id}`,
      name: srv.name,
      kind: "xrpl",
      status,
      latencyMs: ms,
      lastSuccess: Date.now(),
      message: `state ${state}${info.validated_ledger?.seq ? ` · validated #${info.validated_ledger.seq}` : ""}${age !== null ? ` · age ${age}s` : ""}`,
    };
  } catch (e) {
    return { id: `xrpl:${srv.id}`, name: srv.name, kind: "xrpl", status: "DOWN", latencyMs: Date.now() - t0, lastFailure: Date.now(), message: errMsg(e) };
  } finally {
    client.close();
  }
}

async function checkHttp(
  id: string,
  name: string,
  kind: ProviderHealth["kind"],
  url: string,
  validate: (res: Response) => Promise<string>,
): Promise<ProviderHealth> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "XRPTerminal-HealthCheck/1.0 (+https://xrpterminal.com)" },
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { id, name, kind, status: res.status === 429 ? "DEGRADED" : "DOWN", latencyMs: ms, lastFailure: Date.now(), message: `HTTP ${res.status}` };
    const msg = await validate(res);
    return { id, name, kind, status: latencyStatus(ms), latencyMs: ms, lastSuccess: Date.now(), message: msg };
  } catch (e) {
    return { id, name, kind, status: "DOWN", latencyMs: Date.now() - t0, lastFailure: Date.now(), message: errMsg(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSupabase(): Promise<ProviderHealth> {
  const base = { id: "supabase", name: "Supabase (Postgres)", kind: "database" as const };
  if (!isSupabaseConfigured()) return { ...base, status: "UNKNOWN", message: "Not configured" };
  const t0 = Date.now();
  try {
    const sb = getSupabaseAdmin() ?? (await getSupabaseServer());
    if (!sb) return { ...base, status: "UNKNOWN", message: "Not configured" };
    // Cheapest round-trip: HEAD count on the public plans table.
    const { error } = await withTimeout(Promise.resolve(sb.from("plans").select("id", { count: "exact", head: true })), CHECK_TIMEOUT, "Supabase");
    const ms = Date.now() - t0;
    if (error) return { ...base, status: "DEGRADED", latencyMs: ms, lastFailure: Date.now(), message: `Reachable, query error: ${error.message}` };
    return { ...base, status: latencyStatus(ms), latencyMs: ms, lastSuccess: Date.now(), message: "Query OK" };
  } catch (e) {
    return { ...base, status: "DOWN", latencyMs: Date.now() - t0, lastFailure: Date.now(), message: errMsg(e) };
  }
}

export async function runProviderHealthChecks(): Promise<ProviderHealth[]> {
  const newsUrl = process.env.NEWS_HEALTH_FEED_URL || DEFAULT_NEWS_HEALTH_FEED;
  const checks: Promise<ProviderHealth>[] = [
    ...TICKER_PRIORITY.filter((id) => MARKET_PROVIDERS[id]).map(checkMarket),
    ...XRPL_SERVERS.map(checkXrplServer),
    checkHttp("coingecko", "CoinGecko", "market", "https://api.coingecko.com/api/v3/ping", async (r) => {
      const j = (await r.json()) as { gecko_says?: string };
      if (!j.gecko_says) throw new Error("unexpected ping body");
      return "Ping OK";
    }),
    checkHttp("ecb-fx", "ECB FX (Frankfurter)", "fx", "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP", async (r) => {
      const j = (await r.json()) as { date?: string; rates?: Record<string, number> };
      if (!j.rates?.EUR) throw new Error("missing EUR rate");
      return `Reference date ${j.date}`;
    }),
    checkHttp("news-rss", "News RSS feed", "news", newsUrl, async (r) => {
      const text = await r.text();
      if (!/<(rss|feed)[\s>]/i.test(text)) throw new Error("response is not RSS/Atom");
      const items = (text.match(/<(item|entry)[\s>]/gi) ?? []).length;
      return `${items} items · ${new URL(newsUrl).hostname}`;
    }).catch((e) => ({ id: "news-rss", name: "News RSS feed", kind: "news" as const, status: "DOWN" as const, message: errMsg(e) })),
    Promise.resolve<ProviderHealth>({
      id: "anthropic",
      name: "Anthropic (AI)",
      kind: "ai",
      status: "UNKNOWN",
      message: isAiConfigured() ? "Configured · not pinged (cost control)" : "Not configured",
    }),
    Promise.resolve<ProviderHealth>({
      id: "stripe",
      name: "Stripe (billing)",
      kind: "billing",
      status: "UNKNOWN",
      message: isStripeConfigured() ? "Configured · not pinged" : "Not configured",
    }),
    checkSupabase(),
  ];
  return Promise.all(checks);
}

export function overallStatus(list: ProviderHealth[]): ProviderStatus {
  const checked = list.filter((p) => p.status !== "UNKNOWN");
  if (!checked.length) return "UNKNOWN";
  const down = checked.filter((p) => p.status === "DOWN").length;
  const degraded = checked.filter((p) => p.status === "DEGRADED").length;
  if (down === checked.length) return "DOWN";
  if (down || degraded) return "DEGRADED";
  return "HEALTHY";
}
