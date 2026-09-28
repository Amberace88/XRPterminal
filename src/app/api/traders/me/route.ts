import { z } from "zod";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { scanContent } from "@/lib/social/scam";
import { fail, ok, parseBody } from "@/lib/server/api";

async function ctx() {
  if (!isSupabaseConfigured()) return { error: fail("NOT_CONFIGURED", "Verified traders require a Supabase account database (not configured on this deployment).", 503) };
  const user = await getCurrentUser();
  if (!user) return { error: fail("UNAUTHORIZED", "Sign in to manage your trader profile.", 401) };
  return { user, sb: (await getSupabaseServer())! };
}

/** GET /api/traders/me — own trader profile, privacy and linked accounts. */
export async function GET() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { data: trader } = await c.sb.from("traders").select("*").eq("user_id", c.user.id).maybeSingle();
  const { data: accounts } = await c.sb
    .from("trader_accounts")
    .select("id, address, status, challenge_code, challenge_expires_at, verified_at, verified_tx_hash, last_synced_at, created_at")
    .eq("user_id", c.user.id)
    .order("created_at", { ascending: false });
  return ok({ trader: trader ?? null, accounts: accounts ?? [] });
}

const Patch = z.object({
  display_name: z.string().trim().min(2).max(40).optional(),
  bio: z.string().trim().max(400).nullable().optional(),
  public_profile: z.boolean().optional(),
  public_pnl: z.boolean().optional(),
  public_positions: z.boolean().optional(),
  public_trades: z.boolean().optional(),
  public_history: z.boolean().optional(),
  public_wallet: z.boolean().optional(),
  anonymous_stats: z.boolean().optional(),
});

/** PATCH /api/traders/me — update display name, bio and privacy toggles (verification fields are DB-protected). */
export async function PATCH(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const b = await parseBody(req, Patch);
  if ("error" in b) return b.error;
  const text = `${b.data.display_name ?? ""}\n${b.data.bio ?? ""}`;
  const scan = scanContent(text);
  if (scan.flagged) return fail("CONTENT_REJECTED", `Profile text was flagged: ${scan.flags.map((f) => f.label).join("; ")}.`, 422);
  const { data: existing } = await c.sb.from("traders").select("id").eq("user_id", c.user.id).maybeSingle();
  const payload = Object.fromEntries(Object.entries(b.data).filter(([, v]) => v !== undefined));
  const res = existing
    ? await c.sb.from("traders").update(payload).eq("user_id", c.user.id).select("*").single()
    : await c.sb
        .from("traders")
        .insert({ user_id: c.user.id, display_name: b.data.display_name ?? `Trader ${c.user.id.slice(0, 6)}`, ...payload })
        .select("*")
        .single();
  if (res.error) return fail("DB_ERROR", res.error.message, 400);
  return ok({ trader: res.data });
}
