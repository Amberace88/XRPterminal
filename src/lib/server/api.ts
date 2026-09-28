import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

/** Structured API responses (spec §147) — never leak stack traces. */
export function ok<T>(data: T, init?: { status?: number; cacheSeconds?: number; headers?: Record<string, string> }) {
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  if (init?.cacheSeconds) headers["Cache-Control"] = `public, s-maxage=${init.cacheSeconds}, stale-while-revalidate=${init.cacheSeconds * 4}`;
  else headers["Cache-Control"] = headers["Cache-Control"] ?? "no-store";
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200, headers });
}

export function fail(code: string, message: string, status = 400, retryable = false) {
  return NextResponse.json({ ok: false, error: { code, message, retryable } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Parse query params with a zod schema. Returns data or a 400 response. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): { data: T } | { error: NextResponse } {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const r = schema.safeParse(obj);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ");
    return { error: fail("VALIDATION_ERROR", msg, 400) };
  }
  return { data: r.data };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: fail("INVALID_JSON", "Request body must be valid JSON", 400) };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return { error: fail("VALIDATION_ERROR", msg, 400) };
  }
  return { data: r.data };
}

/* ------------------------------------------------------------------ */
/* Rate limiting (spec §148). Fixed-window per key, per server instance.
 * For multi-instance production, back this with Redis/Upstash — the
 * interface stays the same. */
const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-nf-client-connection-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return { allowed: true, remaining: limit - 1, resetIn: windowMs };
  }
  b.count++;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetIn: b.reset - now };
}

export function limitOr429(req: Request, scope: string, limit: number, windowMs: number): NextResponse | null {
  const r = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (r.allowed) return null;
  return NextResponse.json(
    { ok: false, error: { code: "RATE_LIMITED", message: `Too many requests. Try again in ${Math.ceil(r.resetIn / 1000)}s.`, retryable: true } },
    { status: 429, headers: { "Retry-After": String(Math.ceil(r.resetIn / 1000)) } },
  );
}

/** Structured logger that redacts secrets (spec §146). */
const REDACT = /(api[_-]?key|secret|password|seed|private[_-]?key|authorization|token|cookie)/i;
export function log(level: "info" | "warn" | "error", msg: string, meta: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) safe[k] = REDACT.test(k) ? "[REDACTED]" : v;
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
