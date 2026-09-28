import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { CHALLENGE_TTL_MS, generateChallengeCode, utf8ToHex } from "@/lib/social/verification";
import { fail, limitOr429, ok, parseBody } from "@/lib/server/api";

const B = z.object({ address: z.string().trim().min(25).max(60), displayName: z.string().trim().min(2).max(40).optional() });

/**
 * POST /api/traders/challenge — issue a one-time memo code. The user proves control of the
 * address by sending ANY transaction from it (from their own wallet) with this memo.
 * We never request signatures, seeds or keys.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "trader-challenge", 10, 10 * 60_000);
  if (limited) return limited;
  const b = await parseBody(req, B);
  if ("error" in b) return b.error;
  if (!isSupabaseConfigured()) return fail("NOT_CONFIGURED", "Trader verification requires a Supabase account database (not configured on this deployment).", 503);
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in to verify a wallet.", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return fail("NOT_CONFIGURED", "Verification backend (service role) is not configured.", 503);
  const addr = normalizeXrplAddress(b.data.address);
  if (!addr.ok) return fail("VALIDATION_ERROR", addr.reason, 400);
  const address = addr.classic;

  let { data: trader } = await admin.from("traders").select("id").eq("user_id", user.id).maybeSingle();
  if (!trader) {
    const ins = await admin
      .from("traders")
      .insert({ user_id: user.id, display_name: b.data.displayName ?? `Trader ${user.id.slice(0, 6)}`, verification_status: "PENDING" })
      .select("id")
      .single();
    if (ins.error) return fail("DB_ERROR", "Could not create trader profile.", 500, true);
    trader = ins.data;
  }
  const { data: existing } = await admin.from("trader_accounts").select("id, status").eq("user_id", user.id).eq("address", address).maybeSingle();
  if (existing?.status === "VERIFIED") return ok({ status: "VERIFIED", address });
  const { data: claimedElsewhere } = await admin.from("trader_accounts").select("id").eq("address", address).eq("status", "VERIFIED").neq("user_id", user.id).limit(1);
  if (claimedElsewhere?.length) return fail("CONFLICT", "This address is already verified by another account.", 409);

  const code = generateChallengeCode();
  const now = Date.now();
  const row = {
    trader_id: trader.id,
    user_id: user.id,
    address,
    status: "PENDING",
    challenge_code: code,
    challenge_created_at: new Date(now).toISOString(),
    challenge_expires_at: new Date(now + CHALLENGE_TTL_MS).toISOString(),
  };
  const res = existing ? await admin.from("trader_accounts").update(row).eq("id", existing.id) : await admin.from("trader_accounts").insert(row);
  if (res.error) return fail("DB_ERROR", "Could not create challenge.", 500, true);
  await admin.from("traders").update({ verification_status: "PENDING" }).eq("id", trader.id).neq("verification_status", "VERIFIED");
  return ok({
    status: "PENDING",
    address,
    code,
    memoHex: utf8ToHex(code),
    expiresAt: now + CHALLENGE_TTL_MS,
    instructions: [
      "Open your own XRPL wallet app for this address (XRP Terminal never asks for your seed or keys).",
      "Send any small transaction FROM this address — e.g. a 1-drop (0.000001 XRP) payment to yourself or to any account — with the memo text exactly as shown.",
      "Return here and press “Check verification” within 48 hours.",
    ],
  });
}
