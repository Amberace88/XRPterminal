import type { NextRequest } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/config";
import { fail, limitOr429, log, ok, parseBody } from "@/lib/server/api";
import { getCurrentUser, getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { ENGINE_VERSION, replayEvents, summarize } from "@/lib/tradelab/engine";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_TRADES } from "@/lib/tradelab/challenges";
import { drawdownDetail, monthlyPnl, tradeStats } from "@/lib/tradelab/stats";
import type { LedgerEvent } from "@/lib/tradelab/types";

/**
 * Paper leaderboard (spec §120, §289). SIMULATED results only, opt-in only,
 * aggregated only, minimum sample enforced by the database view.
 * GET  → public entries (empty when Supabase is not configured — never fake entries)
 * POST → recompute the caller's own aggregate by replaying their ledger server-side
 */

export interface LeaderboardEntry {
  display_alias: string;
  trade_count: number;
  period_days: number;
  return_pct: number | null;
  max_drawdown_pct: number | null;
  return_to_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  consistency_pct: number | null;
  computed_at: string;
  is_simulated: true;
}

export async function GET(req: NextRequest) {
  const limited = limitOr429(req, "tradelab-leaderboard", 60, 60_000);
  if (limited) return limited;
  if (!isSupabaseConfigured()) return ok({ configured: false, entries: [] as LeaderboardEntry[], minTrades: LEADERBOARD_MIN_TRADES, minDays: LEADERBOARD_MIN_DAYS });
  const sb = await getSupabaseServer();
  if (!sb) return ok({ configured: false, entries: [] as LeaderboardEntry[], minTrades: LEADERBOARD_MIN_TRADES, minDays: LEADERBOARD_MIN_DAYS });
  const { data, error } = await sb.from("paper_leaderboard").select("*").order("return_to_drawdown", { ascending: false, nullsFirst: false }).limit(100);
  if (error) {
    log("warn", "leaderboard read failed", { error: error.message });
    return fail("LEADERBOARD_UNAVAILABLE", "Leaderboard temporarily unavailable.", 503, true);
  }
  return ok({ configured: true, entries: (data ?? []) as LeaderboardEntry[], minTrades: LEADERBOARD_MIN_TRADES, minDays: LEADERBOARD_MIN_DAYS }, { cacheSeconds: 60 });
}

const Body = z.object({ accountId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const limited = limitOr429(req, "tradelab-leaderboard-sync", 10, 60 * 60_000);
  if (limited) return limited;
  if (!isSupabaseConfigured()) return fail("NOT_CONFIGURED", "Accounts are not enabled on this deployment.", 503);
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in to join the paper leaderboard.", 401);
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const sb = await getSupabaseServer();
  const admin = getSupabaseAdmin();
  if (!sb || !admin) return fail("NOT_CONFIGURED", "Leaderboard service not configured.", 503);

  const { data: optin } = await sb.from("paper_leaderboard_optin").select("opted_in").eq("user_id", user.id).maybeSingle();
  if (!optin || !(optin as { opted_in: boolean }).opted_in) return fail("NOT_OPTED_IN", "Opt in to the paper leaderboard first.", 400);

  // RLS: the cookie-bound client only returns the caller's own rows (ownership check).
  const { data: acct } = await sb.from("paper_accounts").select("id").eq("id", body.data.accountId).eq("user_id", user.id).maybeSingle();
  if (!acct) return fail("NOT_FOUND", "Paper account not found.", 404);
  const events: LedgerEvent[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await sb
      .from("paper_events")
      .select("account_id,seq,version,type,event_time,payload")
      .eq("account_id", body.data.accountId)
      .order("seq", { ascending: true })
      .range(from, from + 999);
    if (error) return fail("LEDGER_UNAVAILABLE", "Could not read the paper ledger.", 503, true);
    const rows = (data ?? []) as { account_id: string; seq: number; version: number; type: string; event_time: string; payload: unknown }[];
    events.push(...rows.map((r) => ({ id: `${r.account_id}:${r.seq}`, seq: r.seq, version: r.version, accountId: r.account_id, t: new Date(r.event_time).getTime(), type: r.type, payload: r.payload }) as LedgerEvent));
    if (rows.length < 1000) break;
  }
  // Replay with the same deterministic engine used in the browser.
  const state = replayEvents(body.data.accountId, events);
  const sum = summarize(state);
  const stats = tradeStats(state.trades, sum.startingCapital, sum.equity);
  const dd = drawdownDetail(state.equityCurve);
  const months = monthlyPnl(state.trades);
  const periodDays = Math.floor(((state.lastPriceT ?? state.versionStartedAt) - state.versionStartedAt) / 86_400_000);
  const row = {
    user_id: user.id,
    account_id: body.data.accountId,
    trade_count: stats.totalTrades,
    period_days: Math.max(0, periodDays),
    return_pct: sum.returnPct,
    max_drawdown_pct: dd.maxDrawdownPct,
    return_to_drawdown: dd.maxDrawdownPct > 0 ? sum.returnPct / dd.maxDrawdownPct : null,
    win_rate: stats.winRate,
    profit_factor: stats.profitFactor !== null && Number.isFinite(stats.profitFactor) ? stats.profitFactor : null,
    consistency_pct: months.length ? (months.filter((m) => m.pnl > 0).length / months.length) * 100 : null,
    engine_version: ENGINE_VERSION,
    computed_at: new Date().toISOString(),
  };
  const { error } = await admin.from("paper_leaderboard_stats").upsert(row);
  if (error) {
    log("error", "leaderboard stats write failed", { error: error.message });
    return fail("WRITE_FAILED", "Could not update leaderboard stats.", 503, true);
  }
  await admin.from("paper_leaderboard_optin").update({ account_id: body.data.accountId }).eq("user_id", user.id);
  return ok({ stats: row, eligible: row.trade_count >= LEADERBOARD_MIN_TRADES && row.period_days >= LEADERBOARD_MIN_DAYS });
}
