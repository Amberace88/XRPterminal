import { z } from "zod";
import { recordErrorEvent } from "@/lib/admin/errors";
import { limitOr429, ok, parseBody } from "@/lib/server/api";

/** Client error reports from error boundaries (message + digest only, no user data). */
const Body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const limited = limitOr429(req, "error-report", 10, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  // Strip query strings from paths — they can carry identifiers.
  const path = b.data.path?.split("?")[0]?.replace(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g, "{address}");
  await recordErrorEvent("client", b.data.message, { path, digest: b.data.digest });
  return ok({ received: true });
}
