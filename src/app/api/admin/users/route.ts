import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/server";
import { sanitizeSearch } from "@/lib/admin/guard";
import { fail, ok, parseQuery } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const Q = z.object({
  q: z.string().max(120).optional(),
  plan: z.enum(["free", "pro", "proplus"]).optional(),
  status: z.enum(["active", "suspended", "deleted"]).optional(),
  page: z.coerce.number().int().min(0).max(10_000).default(0),
});
const PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin user search. Returns profile metadata only — never secrets or credentials. */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const { admin } = g.ctx;

  let query = admin
    .from("profiles")
    .select("id, email, display_name, plan, subscription_status, role, status, created_at, updated_at, stripe_customer_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(q.data.page * PAGE, q.data.page * PAGE + PAGE - 1);
  const term = q.data.q ? sanitizeSearch(q.data.q) : "";
  if (term) query = UUID.test(term) ? query.eq("id", term) : query.or(`email.ilike.%${term}%,display_name.ilike.%${term}%`);
  if (q.data.plan) query = query.eq("plan", q.data.plan);
  if (q.data.status) query = query.eq("status", q.data.status);

  const { data, count, error } = await query;
  if (error) return fail("DATABASE_ERROR", error.message, 500, true);
  return ok({ users: data ?? [], total: count ?? 0, page: q.data.page, pageSize: PAGE });
}
