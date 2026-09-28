import type { NextRequest } from "next/server";
import type { ProviderHealth } from "@/lib/types/market";
import { overallStatus, runProviderHealthChecks } from "@/lib/admin/health";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { limitOr429, log, ok } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Active provider health checks (spec §153). Results are cached in memory for 60s per
 * instance so this endpoint cannot be used to amplify traffic to upstream providers.
 */
let cache: { at: number; data: ProviderHealth[] } | null = null;
let inflight: Promise<ProviderHealth[]> | null = null;
const TTL = 60_000;

async function persist(list: ProviderHealth[]) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const rows = list.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    status: p.status,
    latency_ms: p.latencyMs ?? null,
    last_success: p.lastSuccess ? new Date(p.lastSuccess).toISOString() : undefined,
    last_failure: p.lastFailure ? new Date(p.lastFailure).toISOString() : undefined,
    message: p.message ?? null,
    checked_at: new Date().toISOString(),
  }));
  const { error } = await admin.from("provider_health").upsert(rows, { onConflict: "id" });
  if (error) log("warn", "provider_health upsert failed", { error: error.message });
}

export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "health-providers", 20, 60_000);
  if (limited) return limited;
  const force = req.nextUrl.searchParams.get("fresh") === "1";
  if (!force && cache && Date.now() - cache.at < TTL) {
    return ok({ providers: cache.data, overall: overallStatus(cache.data), checkedAt: cache.at, cached: true });
  }
  if (!inflight) {
    inflight = runProviderHealthChecks()
      .then(async (data) => {
        cache = { at: Date.now(), data };
        await persist(data).catch(() => undefined);
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  const data = await inflight;
  return ok({ providers: data, overall: overallStatus(data), checkedAt: cache?.at ?? Date.now(), cached: false });
}
