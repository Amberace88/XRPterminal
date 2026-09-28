import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { clientIp, fail, limitOr429, ok, parseBody } from "@/lib/server/api";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/**
 * Referral tracking (spec §139/§140).
 *  POST — record a click for ?ref=CODE (IP/UA are salted-hashed; duplicates and bursts flagged).
 *  GET  — the signed-in user's own referral code and REAL counts (never fabricated).
 */
const CODE = z.string().regex(/^[a-z0-9-]{4,32}$/i);
const Body = z.object({ code: CODE, path: z.string().max(200).optional() });

const salt = () => process.env.REFERRAL_HASH_SALT || serverEnv().cronSecret || "xrpt-referral";
const hash = (v: string) => createHash("sha256").update(`${salt()}|${v}`).digest("hex").slice(0, 32);

export async function POST(req: Request) {
  const limited = limitOr429(req, "referral-click", 10, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const admin = getSupabaseAdmin();
  // Always answer the same way so the endpoint can't be used to probe which codes exist.
  if (!admin) return ok({ recorded: false });

  const code = b.data.code.toLowerCase();
  const { data: owner } = await admin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
  if (!owner) return ok({ recorded: false });

  const ipHash = hash(clientIp(req));
  const uaHash = hash(req.headers.get("user-agent") ?? "");
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: sameIp } = await admin
    .from("referral_clicks")
    .select("id", { count: "exact", head: true })
    .eq("referral_code", code)
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  const { count: ipAcrossCodes } = await admin
    .from("referral_clicks")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  let flagReason: string | null = null;
  if ((sameIp ?? 0) > 0) flagReason = "duplicate_ip_24h";
  else if ((ipAcrossCodes ?? 0) >= 5) flagReason = "ip_many_codes_24h";

  await admin.from("referral_clicks").insert({
    referral_code: code,
    ip_hash: ipHash,
    ua_hash: uaHash,
    landing_path: b.data.path?.split("?")[0] ?? null,
    flagged: !!flagReason,
    flag_reason: flagReason,
  });
  return ok({ recorded: true });
}

export async function GET(req: Request) {
  const limited = limitOr429(req, "referral-stats", 30, 60_000);
  if (limited) return limited;
  const sb = await getSupabaseServer();
  if (!sb) return fail("NOT_CONFIGURED", "Accounts are not enabled on this deployment.", 503);
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return fail("UNAUTHENTICATED", "Sign in to view your referral link.", 401);
  const { data: profile } = await sb.from("profiles").select("referral_code").eq("id", auth.user.id).maybeSingle();
  const code = profile?.referral_code as string | undefined;
  if (!code) return ok({ code: null, clicks: 0, uniqueClicks: 0, signups: 0, paid: 0 });

  const [{ count: clicks }, { count: unique }, { count: signups }, { count: paid }] = await Promise.all([
    sb.from("referral_clicks").select("id", { count: "exact", head: true }).eq("referral_code", code),
    sb.from("referral_clicks").select("id", { count: "exact", head: true }).eq("referral_code", code).eq("flagged", false),
    sb.from("referral_conversions").select("id", { count: "exact", head: true }).eq("referral_code", code).eq("event", "signup"),
    sb.from("referral_conversions").select("id", { count: "exact", head: true }).eq("referral_code", code).eq("event", "paid"),
  ]);
  return ok({ code, clicks: clicks ?? 0, uniqueClicks: unique ?? 0, signups: signups ?? 0, paid: paid ?? 0 });
}
