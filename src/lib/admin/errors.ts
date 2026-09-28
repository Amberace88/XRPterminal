import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/server/api";

/**
 * Server-side error & job recording for the admin "Errors" and "Jobs" views.
 * Best-effort: never throws, never blocks the caller. Without Supabase it only logs.
 */
export async function recordErrorEvent(
  source: "client" | "server" | "job" | "webhook",
  message: string,
  extra: { path?: string | null; digest?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const msg = message.replace(/\s+/g, " ").slice(0, 1000);
  log("error", `[${source}] ${msg}`, { path: extra.path ?? undefined, digest: extra.digest ?? undefined });
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const fingerprint = createHash("sha256").update(`${source}|${msg}|${extra.path ?? ""}`).digest("hex").slice(0, 32);
  const { error } = await admin.rpc("record_error_event", {
    p_fingerprint: fingerprint,
    p_source: source,
    p_message: msg,
    p_path: extra.path ?? null,
    p_digest: extra.digest ?? null,
    p_metadata: extra.metadata ?? {},
  });
  if (error) log("warn", "record_error_event failed", { error: error.message });
}

/**
 * Wrap a scheduled job so its run is visible in Admin → Jobs.
 * Usage in an /api/jobs/<name> handler: `return runRecordedJob("news-ingest", () => ingest(), { safeToRetry: true })`.
 */
export async function runRecordedJob<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { safeToRetry?: boolean; nextRun?: Date | null } = {},
): Promise<T> {
  const t0 = Date.now();
  const admin = getSupabaseAdmin();
  try {
    const result = await fn();
    await admin?.rpc("record_job_run", {
      p_name: name,
      p_status: "success",
      p_duration_ms: Date.now() - t0,
      p_error: null,
      p_next_run: opts.nextRun?.toISOString() ?? null,
      p_safe_to_retry: opts.safeToRetry ?? null,
    });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin?.rpc("record_job_run", {
      p_name: name,
      p_status: "failed",
      p_duration_ms: Date.now() - t0,
      p_error: message,
      p_next_run: opts.nextRun?.toISOString() ?? null,
      p_safe_to_retry: opts.safeToRetry ?? null,
    });
    await recordErrorEvent("job", message, { path: `job:${name}` });
    throw e;
  }
}
