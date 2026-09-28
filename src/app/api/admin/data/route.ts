import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/server";
import { ADMIN_READABLE_TABLES, isAdminTable, redactSecrets } from "@/lib/admin/guard";
import { fail, ok, parseQuery } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const Q = z.object({
  table: z.string().max(40),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
  action: z.string().max(80).optional(), // audit_logs filter
  status: z.string().max(40).optional(),
});

/**
 * Read-only admin data access for a fixed allow-list of tables (jobs, AI usage, forecasts,
 * reports, audit, errors…). Tables owned by other modules may not exist yet — that is
 * reported as `available: false`, never papered over with sample data.
 */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if ("response" in g) return g.response;
  const q = parseQuery(req, Q);
  if ("error" in q) return q.error;
  const { table, limit, sinceDays, action, status } = q.data;
  if (!isAdminTable(table)) return fail("VALIDATION_ERROR", "Table not allowed", 400);
  const orderCol = ADMIN_READABLE_TABLES[table];
  const { admin } = g.ctx;

  const build = (withOrder: boolean, withSince: boolean) => {
    let query = admin.from(table).select("*").limit(limit);
    if (withOrder) query = query.order(orderCol, { ascending: orderCol === "key", nullsFirst: false });
    if (withSince && sinceDays) query = query.gte(orderCol === "key" ? "updated_at" : orderCol, new Date(Date.now() - sinceDays * 86_400_000).toISOString());
    if (action && table === "audit_logs") query = query.ilike("action", `${action.replace(/[%_]/g, "")}%`);
    if (status) query = query.eq("status", status);
    return query;
  };

  let res = await build(true, true);
  // Schema-tolerant fallback for tables owned by other modules (column names may differ).
  if (res.error && res.error.code !== "42P01" && res.error.code !== "PGRST205") res = await build(false, false);
  if (res.error) {
    const missing = res.error.code === "42P01" || res.error.code === "PGRST205" || /does not exist|Could not find the table/i.test(res.error.message);
    if (missing) return ok({ table, available: false, rows: [], message: `Table "${table}" is not available yet (migration not applied).` });
    return fail("DATABASE_ERROR", res.error.message, 500, true);
  }
  return ok({ table, available: true, rows: (res.data ?? []).map((r) => redactSecrets(r as Record<string, unknown>)) });
}
