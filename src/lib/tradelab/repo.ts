/**
 * Trade Lab persistence (ARCHITECTURE.md "Guest vs account persistence pattern").
 * - Guest mode: browser storage via readLocal/writeLocal (key "tradelab:v1" + sub-keys).
 * - Signed in + Supabase configured: paper_accounts + append-only paper_events (+ projections).
 * The ledger is the source of truth; every other table is a rebuildable projection.
 * PAPER data is never mixed with real portfolio data (spec §295).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage/local";
import type { BacktestResult, Strategy } from "./backtest";
import type { ChallengeEnrollment } from "./challenges";
import type { JournalEntry } from "./journal";
import type { ReplaySession } from "./replay";
import { summarize } from "./engine";
import type { AccountState, LedgerEvent } from "./types";

export const TRADELAB_STORAGE_KEY = "tradelab:v1";
const K_JOURNAL = `${TRADELAB_STORAGE_KEY}:journal`;
const K_REPLAY = `${TRADELAB_STORAGE_KEY}:replay`;
const K_STRATEGIES = `${TRADELAB_STORAGE_KEY}:strategies`;
const K_BACKTESTS = `${TRADELAB_STORAGE_KEY}:backtests`;
const K_CHALLENGES = `${TRADELAB_STORAGE_KEY}:challenges`;

export interface PaperAccountMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface LocalTradeLabStore {
  schema: 1;
  activeAccountId: string | null;
  accounts: (PaperAccountMeta & { events: LedgerEvent[] })[];
}

/** Stored backtest summary (equity curve kept small; full trade list included). */
export interface SavedBacktest {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  result: BacktestResult;
}

export interface TradeLabRepo {
  kind: "local" | "supabase";
  listAccounts(): Promise<PaperAccountMeta[]>;
  loadEvents(accountId: string): Promise<LedgerEvent[]>;
  createAccount(meta: PaperAccountMeta, events: LedgerEvent[], state: AccountState): Promise<void>;
  appendEvents(accountId: string, events: LedgerEvent[], state: AccountState): Promise<void>;
  getActiveAccountId(): Promise<string | null>;
  setActiveAccountId(id: string | null): Promise<void>;
  listJournal(): Promise<JournalEntry[]>;
  saveJournal(e: JournalEntry): Promise<void>;
  removeJournal(id: string): Promise<void>;
  listReplaySessions(): Promise<ReplaySession[]>;
  saveReplaySession(s: ReplaySession): Promise<void>;
  removeReplaySession(id: string): Promise<void>;
  listStrategies(): Promise<Strategy[]>;
  saveStrategy(s: Strategy): Promise<void>;
  removeStrategy(id: string): Promise<void>;
  listBacktests(): Promise<SavedBacktest[]>;
  saveBacktest(b: SavedBacktest): Promise<void>;
  listChallenges(): Promise<ChallengeEnrollment[]>;
  saveChallenge(e: ChallengeEnrollment): Promise<void>;
  removeChallenge(id: ChallengeEnrollment["id"]): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Guest (browser storage)                                             */

const emptyStore = (): LocalTradeLabStore => ({ schema: 1, activeAccountId: null, accounts: [] });

export function readLocalStore(): LocalTradeLabStore {
  const s = readLocal<LocalTradeLabStore | null>(TRADELAB_STORAGE_KEY, null);
  if (!s || s.schema !== 1 || !Array.isArray(s.accounts)) return emptyStore();
  return s;
}

function upsertList<T extends { id: string }>(key: string, item: T, max = 500) {
  const list = readLocal<T[]>(key, []);
  const i = list.findIndex((x) => x.id === item.id);
  const next = i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
  writeLocal(key, next.slice(0, max));
}
function removeFromList<T extends { id: string }>(key: string, id: string) {
  writeLocal(
    key,
    readLocal<T[]>(key, []).filter((x) => x.id !== id),
  );
}

export function localRepo(): TradeLabRepo {
  return {
    kind: "local",
    async listAccounts() {
      return readLocalStore().accounts.map(({ id, name, createdAt }) => ({ id, name, createdAt }));
    },
    async loadEvents(accountId) {
      return readLocalStore().accounts.find((a) => a.id === accountId)?.events ?? [];
    },
    async createAccount(meta, events) {
      const s = readLocalStore();
      writeLocal(TRADELAB_STORAGE_KEY, { ...s, activeAccountId: meta.id, accounts: [...s.accounts.filter((a) => a.id !== meta.id), { ...meta, events }] });
    },
    async appendEvents(accountId, events) {
      if (!events.length) return;
      const s = readLocalStore();
      const accounts = s.accounts.map((a) => {
        if (a.id !== accountId) return a;
        // append-only: keep existing events, add only unseen sequence numbers
        const last = a.events.length ? a.events[a.events.length - 1].seq : 0;
        return { ...a, events: [...a.events, ...events.filter((e) => e.seq > last)] };
      });
      writeLocal(TRADELAB_STORAGE_KEY, { ...s, accounts });
    },
    async getActiveAccountId() {
      return readLocalStore().activeAccountId;
    },
    async setActiveAccountId(id) {
      writeLocal(TRADELAB_STORAGE_KEY, { ...readLocalStore(), activeAccountId: id });
    },
    async listJournal() {
      return readLocal<JournalEntry[]>(K_JOURNAL, []);
    },
    async saveJournal(e) {
      upsertList(K_JOURNAL, e, 5000);
    },
    async removeJournal(id) {
      removeFromList<JournalEntry>(K_JOURNAL, id);
    },
    async listReplaySessions() {
      return readLocal<ReplaySession[]>(K_REPLAY, []);
    },
    async saveReplaySession(s) {
      upsertList(K_REPLAY, s, 50);
    },
    async removeReplaySession(id) {
      removeFromList<ReplaySession>(K_REPLAY, id);
    },
    async listStrategies() {
      return readLocal<Strategy[]>(K_STRATEGIES, []);
    },
    async saveStrategy(s) {
      upsertList(K_STRATEGIES, s, 100);
    },
    async removeStrategy(id) {
      removeFromList<Strategy>(K_STRATEGIES, id);
    },
    async listBacktests() {
      return readLocal<SavedBacktest[]>(K_BACKTESTS, []);
    },
    async saveBacktest(b) {
      upsertList(K_BACKTESTS, b, 30);
    },
    async listChallenges() {
      return readLocal<ChallengeEnrollment[]>(K_CHALLENGES, []);
    },
    async saveChallenge(e) {
      const list = readLocal<ChallengeEnrollment[]>(K_CHALLENGES, []).filter((x) => x.id !== e.id);
      writeLocal(K_CHALLENGES, [...list, e]);
    },
    async removeChallenge(id) {
      writeLocal(
        K_CHALLENGES,
        readLocal<ChallengeEnrollment[]>(K_CHALLENGES, []).filter((x) => x.id !== id),
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Supabase (signed in)                                                */

interface EventRow {
  account_id: string;
  seq: number;
  version: number;
  type: string;
  event_time: string;
  payload: unknown;
}

const iso = (t: number) => new Date(t).toISOString();
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

function toRow(userId: string, e: LedgerEvent) {
  return { user_id: userId, account_id: e.accountId, seq: e.seq, version: e.version, type: e.type, event_time: iso(e.t), payload: e.payload };
}
function fromRow(r: EventRow): LedgerEvent {
  return { id: `${r.account_id}:${r.seq}`, seq: r.seq, accountId: r.account_id, version: r.version, t: ms(r.event_time), type: r.type, payload: r.payload } as LedgerEvent;
}

async function warn(p: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await p;
  if (error) console.warn(`[tradelab] ${what}: ${error.message}`);
}

/** Best-effort projections (orders, fills, positions, trades). Ledger inserts are the part that must succeed. */
async function project(sb: SupabaseClient, userId: string, accountId: string, events: LedgerEvent[], state: AccountState) {
  const sum = summarize(state);
  await warn(
    sb
      .from("paper_accounts")
      .update({ cash_balance: sum.cash, equity: sum.equity, version: state.version, starting_capital: sum.startingCapital, max_drawdown_pct: state.maxDrawdownPct, updated_at: iso(state.updatedAt || Date.now()) })
      .eq("id", accountId),
    "account projection",
  );
  const orderIds = new Set<string>();
  const fills: LedgerEvent[] = [];
  let posChanged = false;
  const closed: string[] = [];
  for (const e of events) {
    if ("orderId" in e.payload && typeof e.payload.orderId === "string") orderIds.add(e.payload.orderId);
    if (e.type === "ORDER_CREATED") orderIds.add(e.payload.order.id);
    if (e.type === "ORDER_FILLED") fills.push(e);
    if (e.type === "POSITION_OPENED" || e.type === "POSITION_UPDATED" || e.type === "POSITION_CLOSED") posChanged = true;
    if (e.type === "POSITION_CLOSED") closed.push(e.payload.positionId);
  }
  const orders = [...orderIds].map((id) => state.orders[id]).filter(Boolean);
  if (orders.length) {
    await warn(
      sb.from("paper_orders").upsert(
        orders.map((o) => ({
          user_id: userId,
          account_id: accountId,
          order_id: o.id,
          version: state.version,
          side: o.side,
          type: o.type,
          role: o.role,
          status: o.status,
          qty: o.qty,
          filled_qty: o.filledQty,
          avg_fill_price: o.avgFillPrice,
          limit_price: o.limitPrice,
          stop_price: o.stopPrice,
          time_in_force: o.tif,
          expires_at: o.expiresAt ? iso(o.expiresAt) : null,
          triggered_at: o.triggeredAt ? iso(o.triggeredAt) : null,
          parent_order_id: o.parentId,
          oco_group: o.ocoGroup,
          reason: o.reason,
          fees: o.fees,
          slippage_cost: o.slippageCost,
          created_at: iso(o.createdAt),
          updated_at: iso(o.updatedAt),
        })),
        { onConflict: "account_id,order_id" },
      ),
      "orders projection",
    );
  }
  if (fills.length) {
    await warn(
      sb.from("paper_fills").upsert(
        fills.map((e) => {
          const f = (e as Extract<LedgerEvent, { type: "ORDER_FILLED" }>).payload.fill;
          return {
            user_id: userId,
            account_id: accountId,
            fill_id: f.id,
            order_id: f.orderId,
            version: e.version,
            side: f.side,
            qty: f.qty,
            price: f.price,
            ref_price: f.refPrice,
            slippage_bps: f.slippageBps,
            slippage_cost: f.slippageCost,
            gross: f.gross,
            fee_rate: f.feeRate,
            fee_amount: f.feeAmount,
            fee_source: f.feeSource,
            liquidity: f.liquidity,
            filled_at: iso(f.t),
          };
        }),
        { onConflict: "account_id,fill_id" },
      ),
      "fills projection",
    );
  }
  if (posChanged) {
    await warn(sb.from("paper_positions").delete().eq("account_id", accountId), "positions projection");
    const p = state.position;
    if (p) {
      await warn(
        sb.from("paper_positions").insert({ user_id: userId, account_id: accountId, position_id: p.id, version: state.version, side: p.side, qty: p.qty, avg_entry: p.avgEntry, fees: p.fees, opened_at: iso(p.openedAt), updated_at: iso(p.updatedAt) }),
        "positions projection",
      );
    }
  }
  const trades = state.trades.filter((t) => closed.includes(t.id));
  if (trades.length) {
    await warn(
      sb.from("paper_trades").upsert(
        trades.map((t) => ({
          user_id: userId,
          account_id: accountId,
          trade_id: t.id,
          version: t.version,
          opened_at: iso(t.openedAt),
          closed_at: iso(t.closedAt),
          qty: t.qty,
          avg_entry: t.avgEntry,
          avg_exit: t.avgExit,
          gross_pnl: t.grossPnl,
          fees: t.fees,
          net_pnl: t.netPnl,
          return_pct: t.returnPct,
          initial_stop: t.initialStop,
          initial_risk: t.initialRisk,
          r_multiple: t.rMultiple,
          exit_roles: t.exitRoles,
        })),
        { onConflict: "account_id,trade_id" },
      ),
      "trades projection",
    );
  }
}

export function supabaseRepo(sb: SupabaseClient, userId: string): TradeLabRepo {
  const activeKey = `${TRADELAB_STORAGE_KEY}:active:${userId}`;
  return {
    kind: "supabase",
    async listAccounts() {
      const { data, error } = await sb.from("paper_accounts").select("id,name,created_at").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; name: string; created_at: string }[]).map((r) => ({ id: r.id, name: r.name, createdAt: ms(r.created_at) }));
    },
    async loadEvents(accountId) {
      const out: LedgerEvent[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb.from("paper_events").select("account_id,seq,version,type,event_time,payload").eq("account_id", accountId).order("seq", { ascending: true }).range(from, from + page - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as EventRow[];
        out.push(...rows.map(fromRow));
        if (rows.length < page) break;
      }
      return out;
    },
    async createAccount(meta, events, state) {
      const sum = summarize(state);
      const { error } = await sb.from("paper_accounts").insert({
        id: meta.id,
        user_id: userId,
        name: meta.name,
        market: "XRP-USD",
        starting_capital: sum.startingCapital,
        cash_balance: sum.cash,
        equity: sum.equity,
        version: state.version,
        status: "active",
        created_at: iso(meta.createdAt),
      });
      if (error) throw new Error(error.message);
      const r = await sb.from("paper_events").insert(events.map((e) => toRow(userId, e)));
      if (r.error) throw new Error(r.error.message);
      writeLocal(activeKey, meta.id);
    },
    async appendEvents(accountId, events, state) {
      if (!events.length) return;
      const { error } = await sb.from("paper_events").insert(events.map((e) => toRow(userId, e)));
      if (error) throw new Error(error.message);
      await project(sb, userId, accountId, events, state);
    },
    async getActiveAccountId() {
      return readLocal<string | null>(activeKey, null);
    },
    async setActiveAccountId(id) {
      writeLocal(activeKey, id);
    },
    async listJournal() {
      const { data, error } = await sb.from("paper_journal").select("id,entry").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; entry: JournalEntry }[]).map((r) => ({ ...r.entry, id: r.id }));
    },
    async saveJournal(e) {
      const { error } = await sb.from("paper_journal").upsert({
        id: e.id,
        user_id: userId,
        account_id: e.accountId,
        trade_id: e.tradeId,
        setup: e.setup || null,
        regime: e.regime || null,
        tags: e.tags,
        confidence: e.confidence,
        entry: e,
        created_at: iso(e.createdAt),
        updated_at: iso(e.updatedAt),
      });
      if (error) throw new Error(error.message);
    },
    async removeJournal(id) {
      const { error } = await sb.from("paper_journal").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async listReplaySessions() {
      const { data, error } = await sb.from("replay_sessions").select("id,session").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; session: ReplaySession }[]).map((r) => ({ ...r.session, id: r.id }));
    },
    async saveReplaySession(s) {
      const { error } = await sb.from("replay_sessions").upsert({
        id: s.id,
        user_id: userId,
        name: s.name,
        market: s.market,
        timeframe: s.timeframe,
        start_at: iso(s.startT),
        end_at: iso(s.endT),
        starting_capital: s.capital,
        strategy: s.strategy || null,
        notes: s.notes || null,
        performance: s.performance,
        session: s,
        created_at: iso(s.createdAt),
        updated_at: iso(s.savedAt),
      });
      if (error) throw new Error(error.message);
    },
    async removeReplaySession(id) {
      const { error } = await sb.from("replay_sessions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async listStrategies() {
      const { data, error } = await sb.from("strategies").select("id,name,description,current_version,backtest_runs,created_at,updated_at,strategy_versions(version,rules,note,created_at)").eq("user_id", userId).order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      type Row = { id: string; name: string; description: string | null; current_version: number; backtest_runs: number; created_at: string; updated_at: string; strategy_versions: { version: number; rules: Strategy["rules"]; note: string | null; created_at: string }[] };
      return ((data ?? []) as Row[]).map((r) => {
        const versions = [...(r.strategy_versions ?? [])].sort((a, b) => a.version - b.version).map((v) => ({ version: v.version, rules: v.rules, note: v.note, createdAt: ms(v.created_at) }));
        const cur = versions.find((v) => v.version === r.current_version) ?? versions[versions.length - 1];
        return { id: r.id, name: r.name, description: r.description ?? "", version: r.current_version, rules: cur?.rules, versions, createdAt: ms(r.created_at), updatedAt: ms(r.updated_at), backtestRuns: r.backtest_runs } as Strategy;
      }).filter((s) => !!s.rules);
    },
    async saveStrategy(s) {
      const { error } = await sb.from("strategies").upsert({ id: s.id, user_id: userId, name: s.name, description: s.description, current_version: s.version, backtest_runs: s.backtestRuns, created_at: iso(s.createdAt), updated_at: iso(s.updatedAt) });
      if (error) throw new Error(error.message);
      // versions are immutable: insert only new ones
      const { data } = await sb.from("strategy_versions").select("version").eq("strategy_id", s.id);
      const have = new Set(((data ?? []) as { version: number }[]).map((r) => r.version));
      const fresh = s.versions.filter((v) => !have.has(v.version));
      if (fresh.length) {
        const r = await sb.from("strategy_versions").insert(fresh.map((v) => ({ strategy_id: s.id, user_id: userId, version: v.version, rules: v.rules, note: v.note, created_at: iso(v.createdAt) })));
        if (r.error) throw new Error(r.error.message);
      }
    },
    async removeStrategy(id) {
      const { error } = await sb.from("strategies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async listBacktests() {
      const { data, error } = await sb.from("backtests").select("id,strategy_id,strategy_name,strategy_version,result").eq("user_id", userId).order("ran_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; strategy_id: string; strategy_name: string; strategy_version: number; result: BacktestResult }[]).map((r) => ({
        id: r.id,
        strategyId: r.strategy_id,
        strategyName: r.strategy_name,
        strategyVersion: r.strategy_version,
        result: r.result,
      }));
    },
    async saveBacktest(b) {
      const r = b.result;
      const { error } = await sb.from("backtests").insert({
        id: b.id,
        user_id: userId,
        strategy_id: b.strategyId,
        strategy_name: b.strategyName,
        strategy_version: b.strategyVersion,
        timeframe: r.config.timeframe,
        start_at: iso(r.config.from),
        end_at: iso(r.config.to),
        starting_capital: r.config.capital,
        fee_pct: r.config.feePct,
        slippage_bps: r.config.slippageBps,
        return_pct: r.returnPct,
        benchmark_return_pct: r.benchmarkReturnPct,
        max_drawdown_pct: r.drawdown.maxDrawdownPct,
        trade_count: r.stats.totalTrades,
        result: { ...r, trades: [] },
        assumptions: r.assumptions,
        warnings: r.warnings,
        ran_at: iso(r.ranAt),
      });
      if (error) throw new Error(error.message);
      if (r.trades.length) {
        await warn(
          sb.from("backtest_trades").insert(
            r.trades.map((t) => ({
              backtest_id: b.id,
              user_id: userId,
              entry_at: iso(t.openedAt),
              exit_at: iso(t.closedAt),
              entry_price: t.avgEntry,
              exit_price: t.avgExit,
              qty: t.qty,
              net_pnl: t.netPnl,
              fees: t.fees,
              return_pct: t.returnPct,
              r_multiple: t.rMultiple,
              exit_reason: t.exitReason,
            })),
          ),
          "backtest trades",
        );
      }
    },
    async listChallenges() {
      const { data, error } = await sb.from("paper_challenges").select("challenge,started_at,account_id").eq("user_id", userId).eq("status", "active");
      if (error) throw new Error(error.message);
      return ((data ?? []) as { challenge: ChallengeEnrollment["id"]; started_at: string; account_id: string | null }[]).map((r) => ({ id: r.challenge, startedAt: ms(r.started_at), accountId: r.account_id }));
    },
    async saveChallenge(e) {
      await warn(sb.from("paper_challenges").update({ status: "abandoned" }).eq("user_id", userId).eq("challenge", e.id).eq("status", "active"), "challenge restart");
      const { error } = await sb.from("paper_challenges").insert({ user_id: userId, challenge: e.id, account_id: e.accountId, started_at: iso(e.startedAt), status: "active" });
      if (error) throw new Error(error.message);
    },
    async removeChallenge(id) {
      const { error } = await sb.from("paper_challenges").update({ status: "abandoned" }).eq("user_id", userId).eq("challenge", id).eq("status", "active");
      if (error) throw new Error(error.message);
    },
  };
}

export function getTradeLabRepo(userId: string | null): TradeLabRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  return sb && userId ? supabaseRepo(sb, userId) : localRepo();
}
