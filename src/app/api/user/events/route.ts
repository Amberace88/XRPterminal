import { z } from "zod";
import { getCurrentUser, getSupabaseAdmin } from "@/lib/supabase/server";
import { limitOr429, ok, parseBody } from "@/lib/server/api";

/**
 * Product analytics ingestion (spec §327). The client only calls this after the visitor
 * opted in to analytics (see src/components/marketing/track.ts). Props are small, flat and
 * must not contain personal data.
 */
const EVENT_NAMES = [
  "signup",
  "onboarding_complete",
  "wallet_connected",
  "portfolio_view",
  "future_view",
  "trade_lab_started",
  "paper_trade",
  "strategy_created",
  "alert_created",
  "academy_module_completed",
  "checkout_started",
  "page_view",
] as const;

const Body = z.object({
  name: z.enum(EVENT_NAMES),
  props: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
});

export async function POST(req: Request) {
  const limited = limitOr429(req, "product-events", 60, 60_000);
  if (limited) return limited;
  const b = await parseBody(req, Body);
  if ("error" in b) return b.error;
  const admin = getSupabaseAdmin();
  if (!admin) return ok({ stored: false });
  const user = await getCurrentUser();
  const props = Object.fromEntries(Object.entries(b.data.props ?? {}).slice(0, 10));
  const { error } = await admin.from("product_events").insert({ user_id: user?.id ?? null, name: b.data.name, props });
  return ok({ stored: !error });
}
