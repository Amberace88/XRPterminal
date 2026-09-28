import { z } from "zod";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { dropsToXrpString } from "@/lib/xrpl/amount";
import { fetchAccountExistence } from "@/lib/xrpl/server";
import { looksLikeSecret, SECRET_WARNING } from "@/lib/portfolio/validation";

/**
 * POST /api/wallets/validate { address }
 * Validates format (classic or X-address) and existence on the validated ledger via account_info.
 * Public addresses only — this endpoint never accepts or needs secrets.
 */
export const dynamic = "force-dynamic";

// generous max so pasted seed phrases reach the explicit SECRET_REJECTED message (never logged)
const Body = z.object({ address: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const limited = limitOr429(req, "wallet-validate", 30, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  if (looksLikeSecret(b.data.address))
    return fail("SECRET_REJECTED", SECRET_WARNING, 400);
  const n = normalizeXrplAddress(b.data.address);
  if (!n.ok) return fail("INVALID_ADDRESS", n.reason, 400);
  try {
    const r = await fetchAccountExistence(n.classic);
    if (!r.exists)
      return ok({ classic: n.classic, tag: n.tag ?? null, exists: false, server: r.server, message: "Account not found on the validated ledger (never funded or deleted)." });
    const d = r.info.account_data;
    return ok({
      classic: n.classic,
      tag: n.tag ?? null,
      exists: true,
      balanceXrp: Number(dropsToXrpString(d.Balance)),
      sequence: d.Sequence,
      ownerCount: d.OwnerCount,
      ledgerIndex: r.info.ledger_index ?? null,
      server: r.server,
    });
  } catch (e) {
    log("warn", "wallet validate: xrpl unavailable", { error: (e as Error).message });
    return fail("XRPL_UNAVAILABLE", "Could not reach an XRPL server to verify the account. Try again.", 503, true);
  }
}
