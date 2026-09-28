import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/server";
import { ok } from "@/lib/server/api";
import { isStripeConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

type Filter = ["eq" | "gte" | "in", string, string | string[]];

async function count(admin: SupabaseClient, table: string, filters: Filter[] = []): Promise<number | null> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  for (const [op, col, val] of filters) {
    if (op === "eq") q = q.eq(col, val as string);
    else if (op === "gte") q = q.gte(col, val as string);
    else q = q.in(col, val as string[]);
  }
  const { count: c, error } = await q;
  return error ? null : (c ?? 0);
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

/** Admin overview KPIs (spec §134). Every number is a real count; missing tables → null. */
export async function GET() {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const { admin } = g.ctx;

  const [total, free, pro, proplus, suspended, new7, new30, subsActive, subsPastDue, subsCanceled, errors24h, jobsFailed, ai24h] = await Promise.all([
    count(admin, "profiles"),
    count(admin, "profiles", [["eq", "plan", "free"]]),
    count(admin, "profiles", [["eq", "plan", "pro"]]),
    count(admin, "profiles", [["eq", "plan", "proplus"]]),
    count(admin, "profiles", [["eq", "status", "suspended"]]),
    count(admin, "profiles", [["gte", "created_at", ago(7 * DAY)]]),
    count(admin, "profiles", [["gte", "created_at", ago(30 * DAY)]]),
    count(admin, "subscriptions", [["in", "status", ["active", "trialing"]]]),
    count(admin, "subscriptions", [["eq", "status", "past_due"]]),
    count(admin, "subscriptions", [["eq", "status", "canceled"]]),
    count(admin, "error_events", [["gte", "last_seen", ago(DAY)]]),
    count(admin, "system_jobs", [["eq", "status", "failed"]]),
    count(admin, "ai_usage", [["gte", "created_at", ago(DAY)]]),
  ]);

  // Active users from auth last_sign_in_at (bounded scan; flagged when truncated).
  const now = Date.now();
  let signedIn1 = 0;
  let signedIn7 = 0;
  let signedIn30 = 0;
  let scanned = 0;
  let truncated = false;
  const PER_PAGE = 1000;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error || !data) break;
    for (const u of data.users) {
      scanned++;
      const t = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
      if (now - t < DAY) signedIn1++;
      if (now - t < 7 * DAY) signedIn7++;
      if (now - t < 30 * DAY) signedIn30++;
    }
    if (data.users.length < PER_PAGE) break;
    if (page === 5) truncated = true;
  }

  // Product-active users (analytics opt-in only) in the last 7 days.
  let productActive7: number | null = null;
  const { data: ev, error: evErr } = await admin.from("product_events").select("user_id").gte("created_at", ago(7 * DAY)).not("user_id", "is", null).limit(20000);
  if (!evErr) productActive7 = new Set((ev ?? []).map((r) => r.user_id as string)).size;

  return ok({
    users: { total, byPlan: { free, pro, proplus }, suspended, new7d: new7, new30d: new30 },
    activity: { signedIn1d: signedIn1, signedIn7d: signedIn7, signedIn30d: signedIn30, scanned, truncated, productActive7d: productActive7 },
    subscriptions: { active: subsActive, pastDue: subsPastDue, canceled: subsCanceled },
    system: { errors24h, jobsFailed, aiRequests24h: ai24h },
    stripeConfigured: isStripeConfigured(),
    generatedAt: new Date().toISOString(),
  });
}
