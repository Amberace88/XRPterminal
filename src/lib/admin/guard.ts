/**
 * Pure admin authorization decision (spec §259: never trust a frontend admin flag).
 * The inputs MUST come from the server (Supabase session + profiles row). Unit-tested.
 */
export type AdminAccess =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "unauthenticated" | "forbidden" | "suspended"; status: 401 | 403 | 503 };

export interface AdminAccessInput {
  configured: boolean;
  userId: string | null | undefined;
  role: string | null | undefined;
  status?: string | null;
}

export function evaluateAdminAccess(i: AdminAccessInput): AdminAccess {
  if (!i.configured) return { ok: false, reason: "not_configured", status: 503 };
  if (!i.userId) return { ok: false, reason: "unauthenticated", status: 401 };
  if (i.status && i.status !== "active") return { ok: false, reason: "suspended", status: 403 };
  if (i.role !== "admin") return { ok: false, reason: "forbidden", status: 403 };
  return { ok: true };
}

/** Admin routes that the middleware guards (prefix match). */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Tables the admin data endpoint may read, with their preferred ordering column.
 * Anything not listed here is rejected — the admin API is not a generic SQL proxy.
 */
export const ADMIN_READABLE_TABLES = {
  system_jobs: "last_run",
  ai_usage: "created_at",
  forecasts: "created_at",
  social_reports: "created_at",
  audit_logs: "created_at",
  error_events: "last_seen",
  provider_health: "checked_at",
  feature_flags: "key",
  gdpr_requests: "requested_at",
  product_events: "created_at",
  subscriptions: "updated_at",
  referral_clicks: "created_at",
  referral_conversions: "created_at",
} as const;
export type AdminTable = keyof typeof ADMIN_READABLE_TABLES;
export const isAdminTable = (t: string): t is AdminTable => Object.prototype.hasOwnProperty.call(ADMIN_READABLE_TABLES, t);

/** Keys that must never be returned to the admin UI (spec §135: no secrets). */
const SECRET_KEY = /(secret|password|private[_-]?key|seed|mnemonic|api[_-]?key|encrypted|ciphertext|token|iv$|nonce|auth[_-]?tag)/i;

export function redactSecrets<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Sanitise a free-text user search term for a PostgREST ilike filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);
}

/* ------------------------------------------------------------------ */
/* AI usage aggregation (ai_usage table is owned by 0060 — schema tolerant). */

export interface AiUsageSummary {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  costIsEstimate: boolean;
  avgLatencyMs: number | null;
  byFeature: { feature: string; requests: number; tokens: number }[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);
const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  return undefined;
};

/**
 * Default price assumption for cost ESTIMATES when rows carry no cost column.
 * USD per million tokens — configurable via env, clearly labelled as an estimate in the UI.
 */
export const DEFAULT_TOKEN_PRICE = { inputPerM: 3, outputPerM: 15 };

export function summarizeAiUsage(rows: Record<string, unknown>[], price = DEFAULT_TOKEN_PRICE): AiUsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let hasCost = false;
  let errors = 0;
  let latSum = 0;
  let latN = 0;
  const feat = new Map<string, { requests: number; tokens: number }>();
  for (const r of rows) {
    const it = num(pick(r, ["input_tokens", "tokens_in", "prompt_tokens"]));
    const ot = num(pick(r, ["output_tokens", "tokens_out", "completion_tokens"]));
    const total = it + ot || num(pick(r, ["total_tokens", "tokens"]));
    inputTokens += it;
    outputTokens += ot;
    const c = pick(r, ["cost_usd", "cost", "estimated_cost_usd"]);
    if (c !== undefined) {
      hasCost = true;
      cost += num(c);
    } else {
      cost += (it / 1e6) * price.inputPerM + (ot / 1e6) * price.outputPerM;
    }
    const status = String(pick(r, ["status", "outcome"]) ?? "");
    if (r.error || status === "error" || status === "failed") errors++;
    const lat = pick(r, ["latency_ms", "duration_ms"]);
    if (lat !== undefined) {
      latSum += num(lat);
      latN++;
    }
    const f = String(pick(r, ["feature", "kind", "endpoint", "purpose"]) ?? "unknown");
    const cur = feat.get(f) ?? { requests: 0, tokens: 0 };
    cur.requests++;
    cur.tokens += total;
    feat.set(f, cur);
  }
  return {
    requests: rows.length,
    errors,
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round(cost * 100) / 100,
    costIsEstimate: !hasCost,
    avgLatencyMs: latN ? Math.round(latSum / latN) : null,
    byFeature: [...feat.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.requests - a.requests),
  };
}
