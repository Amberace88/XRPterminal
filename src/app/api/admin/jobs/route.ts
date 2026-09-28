import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/admin/server";
import { fail, ok, parseBody } from "@/lib/server/api";
import { serverEnv } from "@/lib/server/env";
import { originOf } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/) });

/** Retry a job that is explicitly marked safe_to_retry (spec §238). Calls /api/jobs/<name> with CRON_SECRET. */
export async function POST(req: Request) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const { admin, user } = g.ctx;
  const secret = serverEnv().cronSecret;
  if (!secret) return fail("CRON_NOT_CONFIGURED", "CRON_SECRET is not configured.", 503);

  const { data: job } = await admin.from("system_jobs").select("name, safe_to_retry, status").eq("name", b.data.name).maybeSingle();
  if (!job) return fail("NOT_FOUND", "Job not found", 404);
  if (!job.safe_to_retry) return fail("NOT_RETRYABLE", "This job is not marked safe to retry.", 409);
  if (job.status === "running") return fail("ALREADY_RUNNING", "The job is currently running.", 409);

  const url = `${originOf(req)}/api/jobs/${b.data.name}`;
  const headers = { Authorization: `Bearer ${secret}`, "x-cron-secret": secret, "x-triggered-by": "admin-retry" };
  let res = await fetch(url, { method: "POST", headers, cache: "no-store" }).catch(() => null);
  if (res && res.status === 405) res = await fetch(url, { method: "GET", headers, cache: "no-store" }).catch(() => null);

  await writeAudit(admin, {
    action: "admin.job_retried",
    actorId: user.id,
    targetType: "job",
    targetId: b.data.name,
    metadata: { httpStatus: res?.status ?? null },
    req,
  });
  if (!res) return fail("JOB_UNREACHABLE", "The job endpoint could not be reached.", 502, true);
  if (!res.ok) return fail("JOB_FAILED", `Job endpoint returned HTTP ${res.status}.`, 502, true);
  return ok({ triggered: true, httpStatus: res.status });
}
