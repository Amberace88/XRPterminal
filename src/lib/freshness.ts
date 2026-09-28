import type { DataStatus } from "@/lib/types/market";

/**
 * Data freshness classification (spec §22, §179).
 * Thresholds are per data kind — a 30s-old price is RECENT, a 30s-old daily candle is LIVE.
 */
export const FRESHNESS_THRESHOLDS = {
  realtime: { live: 15_000, recent: 120_000 },
  minute: { live: 90_000, recent: 10 * 60_000 },
  hourly: { live: 2 * 3_600_000, recent: 6 * 3_600_000 },
  daily: { live: 36 * 3_600_000, recent: 72 * 3_600_000 },
} as const;

export type FreshnessKind = keyof typeof FRESHNESS_THRESHOLDS;

export function freshnessStatus(
  timestamp: number | null | undefined,
  kind: FreshnessKind = "realtime",
  now: number = Date.now(),
  streaming = false,
): DataStatus {
  if (!timestamp || !Number.isFinite(timestamp)) return "UNAVAILABLE";
  const age = now - timestamp;
  const t = FRESHNESS_THRESHOLDS[kind];
  // "LIVE" is reserved for streaming sources (spec §21: never pretend polled data is live).
  if (age <= t.live) return streaming ? "LIVE" : "RECENT";
  if (age <= t.recent) return "RECENT";
  return "STALE";
}
