import type { NextRequest } from "next/server";
import { z } from "zod";
import { isValidClassicAddress } from "ripple-address-codec";
import { fail, limitOr429, log, ok, parseQuery } from "@/lib/server/api";
import { parseWellKnown, XRPSCAN_WELL_KNOWN_URL, type WalletLabel } from "@/lib/xrpl/labels";

/**
 * GET /api/xrpl/labels[?address=r…]
 * XRPScan well-known account names, fetched server-side and cached for 24h per instance.
 * Graceful failure: returns `available:false` (or the last good copy marked stale) instead of erroring.
 */
export const dynamic = "force-dynamic";

const TTL = 24 * 3_600_000;
let cache: { labels: WalletLabel[]; fetchedAt: number } | null = null;
let inflight: Promise<{ labels: WalletLabel[]; fetchedAt: number }> | null = null;

async function load(): Promise<{ labels: WalletLabel[]; fetchedAt: number }> {
  const res = await fetch(XRPSCAN_WELL_KNOWN_URL, {
    headers: { Accept: "application/json", "User-Agent": "XRPTerminal/1.0 (+https://xrpterminal.com)" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`XRPScan responded ${res.status}`);
  const json: unknown = await res.json();
  const labels = parseWellKnown(json, isValidClassicAddress);
  if (!labels.length) throw new Error("XRPScan returned no usable labels");
  return { labels, fetchedAt: Date.now() };
}

const Query = z.object({ address: z.string().max(64).optional() });

export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "xrpl-labels", 60, 60_000);
  if (limited) return limited;
  const q = parseQuery(req, Query);
  if ("error" in q) return q.error;
  const addr = q.data.address?.trim();
  if (addr && !isValidClassicAddress(addr)) return fail("INVALID_ADDRESS", "Not a valid classic XRPL address", 400);

  let stale = false;
  let error: string | null = null;
  if (!cache || Date.now() - cache.fetchedAt > TTL) {
    try {
      inflight = inflight ?? load();
      cache = await inflight;
    } catch (e) {
      error = (e as Error).message;
      stale = !!cache;
      log("warn", "xrpscan labels unavailable", { error });
    } finally {
      inflight = null;
    }
  }
  const labels = cache ? (addr ? cache.labels.filter((l) => l.address === addr) : cache.labels) : [];
  return ok(
    {
      available: !!cache,
      stale,
      error: cache ? null : error,
      source: "XRPScan well-known account names",
      sourceUrl: XRPSCAN_WELL_KNOWN_URL,
      fetchedAt: cache?.fetchedAt ?? null,
      count: labels.length,
      labels,
    },
    { cacheSeconds: cache && !stale ? 3600 : undefined },
  );
}
