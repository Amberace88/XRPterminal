import { getTicker } from "@/lib/providers/market/registry";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/server/env";
import { runTick, utcDay, type EngineState } from "@/lib/alerts/engine";
import { isEmailConfigured, sendAlertEmail } from "@/lib/alerts/email";
import { SERVER_EVALUABLE, type AlertRule } from "@/lib/alerts/types";
import { fail, log, ok } from "@/lib/server/api";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface RuleRow {
  id: string;
  user_id: string;
  name: string;
  conditions: AlertRule["conditions"];
  priority: AlertRule["priority"];
  cooldown_min: number;
  channels: AlertRule["channels"];
  enabled: boolean;
  last_state: boolean | null;
  last_triggered_at: string | null;
  trigger_count: number;
}

function authorized(req: Request): boolean {
  const secret = serverEnv().cronSecret;
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret;
}

/**
 * Server-side evaluation of ticker-based alert rules for signed-in users (every 5 min via
 * netlify/functions/alerts-check.mts). Writes alert_events and sends email when configured.
 */
async function handle(req: Request) {
  if (!serverEnv().cronSecret) return fail("NOT_CONFIGURED", "CRON_SECRET not configured.", 503);
  if (!authorized(req)) return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
  const admin = getSupabaseAdmin();
  if (!admin) return ok({ skipped: true, reason: "Supabase service role not configured." });
  const started = Date.now();
  let ticker;
  try {
    ticker = (await getTicker("XRP-USD")).ticker;
  } catch (e) {
    return fail("MARKET_DATA_UNAVAILABLE", e instanceof Error ? e.message : "ticker unavailable", 503, true);
  }
  const { data: rows, error } = await admin.from("alert_rules").select("*").eq("enabled", true).eq("server_eval", true).limit(5000);
  if (error) return fail("DB_ERROR", error.message, 500, true);
  const rules = ((rows ?? []) as RuleRow[]).filter((r) => r.conditions.every((c) => SERVER_EVALUABLE.includes(c.type)));
  const users = [...new Set(rules.map((r) => r.user_id))];
  const dayStart = new Date(`${utcDay(started)}T00:00:00Z`).toISOString();
  const [{ data: evs }, { data: settings }, { data: profiles }] = await Promise.all([
    users.length ? admin.from("alert_events").select("user_id").eq("origin", "server").gte("created_at", dayStart).in("user_id", users) : Promise.resolve({ data: [] }),
    users.length ? admin.from("alert_settings").select("user_id, email, daily_limit").in("user_id", users) : Promise.resolve({ data: [] }),
    users.length ? admin.from("profiles").select("id, email").in("id", users) : Promise.resolve({ data: [] }),
  ]);
  const dayCount = new Map<string, number>();
  for (const e of (evs ?? []) as { user_id: string }[]) dayCount.set(e.user_id, (dayCount.get(e.user_id) ?? 0) + 1);
  const settingsBy = new Map(((settings ?? []) as { user_id: string; email: boolean; daily_limit: number }[]).map((s) => [s.user_id, s]));
  const emailBy = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  const ctx = { now: started, price: ticker.price, changePct24h: ticker.changePct24h ?? null, volume24hQuote: ticker.volume24hQuote ?? null };
  let fired = 0;
  let emailed = 0;
  for (const r of rules) {
    const rule: AlertRule = {
      id: r.id,
      name: r.name,
      conditions: r.conditions,
      priority: r.priority,
      cooldownMin: r.cooldown_min,
      channels: r.channels,
      enabled: r.enabled,
      createdAt: 0,
      updatedAt: 0,
      lastTriggeredAt: r.last_triggered_at ? Date.parse(r.last_triggered_at) : null,
      triggerCount: r.trigger_count,
    };
    const state: EngineState = {
      lastMet: { [r.id]: r.last_state ?? false },
      lastFired: rule.lastTriggeredAt ? { [r.id]: rule.lastTriggeredAt } : {},
      dedupe: {},
      day: utcDay(started),
      dayCount: dayCount.get(r.user_id) ?? 0,
    };
    const s = settingsBy.get(r.user_id);
    const res = runTick([rule], ctx, state, { dailyLimit: s?.daily_limit ?? 50 });
    const newState = res.state.lastMet[r.id];
    const f = res.fired[0];
    if (!f) {
      if (newState !== (r.last_state ?? false)) await admin.from("alert_rules").update({ last_state: newState }).eq("id", r.id);
      continue;
    }
    fired++;
    dayCount.set(r.user_id, (dayCount.get(r.user_id) ?? 0) + 1);
    const channels: string[] = ["history"];
    const to = emailBy.get(r.user_id);
    if (rule.channels.email && s?.email && to && isEmailConfigured()) {
      if (await sendAlertEmail(to, `XRP Terminal alert: ${f.title}`, `${f.body}\n\nSource: ${ticker.provenance.source} at ${new Date(ticker.provenance.timestamp).toISOString()}`)) {
        channels.push("email");
        emailed++;
      }
    }
    await admin.from("alert_events").insert({ user_id: r.user_id, rule_id: r.id, rule_name: r.name, title: f.title, body: f.body, priority: f.priority, origin: "server", channels, dedupe_key: f.dedupeKey });
    await admin
      .from("alert_rules")
      .update({ last_state: newState, last_triggered_at: new Date(started).toISOString(), trigger_count: r.trigger_count + 1 })
      .eq("id", r.id);
  }
  log("info", "alerts job", { rules: rules.length, fired, emailed, ms: Date.now() - started });
  return ok({ evaluated: rules.length, fired, emailed, price: ticker.price, source: ticker.provenance.source, ms: Date.now() - started });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
