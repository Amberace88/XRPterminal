"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMarket } from "@/components/providers/MarketProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { planOf } from "@/lib/entitlements";
import type { CandleSeries, DataStatus } from "@/lib/types/market";
import {
  cancelOrder as engineCancel,
  closePosition as engineClose,
  createAccount as engineCreate,
  openOrders,
  placeOrder as enginePlace,
  processTick,
  replayEvents,
  resetAccount as engineReset,
  summarize,
  updateSettings as engineSettings,
  type CommandResult,
  type PlaceResult,
} from "@/lib/tradelab/engine";
import { getTradeLabRepo, TRADELAB_STORAGE_KEY, type PaperAccountMeta, type SavedBacktest, type TradeLabRepo } from "@/lib/tradelab/repo";
import type { Strategy } from "@/lib/tradelab/backtest";
import type { ChallengeEnrollment } from "@/lib/tradelab/challenges";
import type { JournalEntry } from "@/lib/tradelab/journal";
import type { ReplaySession } from "@/lib/tradelab/replay";
import type { AccountSettings, AccountState, AccountSummary, LedgerEvent, MarketSnapshot, OrderInput } from "@/lib/tradelab/types";

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

export interface TradeLabCtx {
  repoKind: "local" | "supabase";
  loading: boolean;
  error: string | null;
  persistError: string | null;
  reload: () => void;
  accounts: PaperAccountMeta[];
  accountId: string | null;
  events: LedgerEvent[];
  state: AccountState | null;
  summary: AccountSummary | null;
  snapshot: MarketSnapshot | null;
  marketStatus: DataStatus;
  streaming: boolean;
  venue: string | null;
  maxAccounts: number;
  createAccount: (capital: number, name: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  placeOrder: (input: OrderInput) => PlaceResult | null;
  cancelOrder: (orderId: string) => void;
  closePosition: () => PlaceResult | null;
  resetAccount: (capital: number) => void;
  updateSettings: (s: AccountSettings) => void;
  journal: JournalEntry[];
  saveJournal: (e: JournalEntry) => Promise<void>;
  removeJournal: (id: string) => Promise<void>;
  replaySessions: ReplaySession[];
  saveReplaySession: (s: ReplaySession) => Promise<void>;
  removeReplaySession: (id: string) => Promise<void>;
  strategies: Strategy[];
  saveStrategy: (s: Strategy) => Promise<void>;
  removeStrategy: (id: string) => Promise<void>;
  backtests: SavedBacktest[];
  saveBacktest: (b: SavedBacktest) => Promise<void>;
  challenges: ChallengeEnrollment[];
  startChallenge: (e: ChallengeEnrollment) => Promise<void>;
  abandonChallenge: (id: ChallengeEnrollment["id"]) => Promise<void>;
}

const Ctx = createContext<TradeLabCtx | null>(null);
/** Exposed for tests / storybook-style previews with a seeded simulated account. */
export const TradeLabContext = Ctx;

export function useTradeLab(): TradeLabCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTradeLab must be used inside TradeLabProvider");
  return c;
}

/**
 * Owns the SIMULATED paper account: loads the ledger, replays it into state, runs the
 * real-time simulation loop on every market update (spec §270) and appends new events
 * to storage in order. Market data is only ever read, never sent anywhere.
 */
export function TradeLabProvider({ children }: { children: React.ReactNode }) {
  const { ticker, status, streaming, venue } = useMarket();
  const { user, loading: authLoading, plan } = useAuth();
  const userId = user?.id ?? null;
  const repo: TradeLabRepo = useMemo(() => getTradeLabRepo(userId), [userId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [accounts, setAccounts] = useState<PaperAccountMeta[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [state, setState] = useState<AccountState | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [replaySessions, setReplaySessions] = useState<ReplaySession[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtests, setBacktests] = useState<SavedBacktest[]>([]);
  const [challenges, setChallenges] = useState<ChallengeEnrollment[]>([]);

  const stateRef = useRef<AccountState | null>(null);
  const eventsRef = useRef<LedgerEvent[]>([]);
  const idRef = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // ---------------------------------------------------------------- load
  const loadAccount = useCallback(
    async (id: string | null) => {
      if (!id) {
        idRef.current = null;
        stateRef.current = null;
        eventsRef.current = [];
        setAccountId(null);
        setEvents([]);
        setState(null);
        return;
      }
      const evs = await repo.loadEvents(id);
      const st = replayEvents(id, evs);
      idRef.current = id;
      eventsRef.current = evs;
      stateRef.current = st.initialized ? st : null;
      setAccountId(id);
      setEvents(evs);
      setState(st.initialized ? st : null);
    },
    [repo],
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [accs, active, j, rs, strat, bts, ch] = await Promise.all([
          repo.listAccounts(),
          repo.getActiveAccountId(),
          repo.listJournal(),
          repo.listReplaySessions(),
          repo.listStrategies(),
          repo.listBacktests(),
          repo.listChallenges(),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setJournal(j);
        setReplaySessions(rs);
        setStrategies(strat);
        setBacktests(bts);
        setChallenges(ch);
        const id = accs.find((a) => a.id === active)?.id ?? accs[accs.length - 1]?.id ?? null;
        await loadAccount(id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load Trade Lab data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, authLoading, loadAccount, nonce]);

  // Another tab changed guest storage → reload the ledger (keeps tabs consistent).
  useEffect(() => {
    if (repo.kind !== "local") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === `xrpt:${TRADELAB_STORAGE_KEY}` && idRef.current) loadAccount(idRef.current).catch(() => undefined);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [repo, loadAccount]);

  // ---------------------------------------------------------------- commit
  const commit = useCallback(
    (r: CommandResult) => {
      const id = idRef.current;
      if (!id || !r.events.length) return;
      stateRef.current = r.state;
      eventsRef.current = [...eventsRef.current, ...r.events];
      setState(r.state);
      setEvents(eventsRef.current);
      queue.current = queue.current
        .then(() => repo.appendEvents(id, r.events, r.state))
        .then(() => setPersistError(null))
        .catch((e: unknown) => setPersistError(e instanceof Error ? e.message : "Could not save simulation events"));
    },
    [repo],
  );

  // ---------------------------------------------------------------- live loop
  const snapshot = useMemo<MarketSnapshot | null>(() => {
    if (!ticker || !(ticker.price > 0)) return null;
    return {
      price: ticker.price,
      bid: ticker.bid && ticker.bid > 0 ? ticker.bid : undefined,
      ask: ticker.ask && ticker.ask > 0 ? ticker.ask : undefined,
      // `t` = when the simulation received the update; quoteT = exchange time (staleness)
      t: Math.max(Date.now(), ticker.provenance.fetchedAt),
      quoteT: ticker.provenance.timestamp || ticker.provenance.fetchedAt,
      source: ticker.provenance.source,
    };
  }, [ticker]);
  const snapRef = useRef<MarketSnapshot | null>(null);
  snapRef.current = snapshot;

  useEffect(() => {
    const st = stateRef.current;
    if (!st || !snapshot) return;
    commit(processTick(st, snapshot));
  }, [snapshot, commit]);

  // Candle-close sweep for resting orders: catches prints between (polled) ticker updates.
  const hasResting = !!state && openOrders(state).some((o) => o.type !== "MARKET");
  const sweep = useApi<CandleSeries>(hasResting ? "/api/market/candles?pair=XRP-USD&tf=1m&limit=5" : null, { refreshMs: 30_000, staleMs: 20_000 });
  const lastSwept = useRef(0);
  useEffect(() => {
    const st = stateRef.current;
    const candles = sweep.data?.candles;
    if (!st || !candles?.length) return;
    const now = Date.now();
    let cur = st;
    const out: LedgerEvent[] = [];
    for (const k of candles) {
      const closeT = k.t + 60_000 - 1;
      if (closeT > now || closeT <= lastSwept.current) continue;
      if (cur.lastPriceT !== null && closeT < cur.lastPriceT) continue;
      lastSwept.current = closeT;
      const path = k.c >= k.o ? [k.l, k.h] : [k.h, k.l];
      for (const p of path) {
        const r = processTick(cur, { price: p, t: closeT, quoteT: closeT, source: `${sweep.data?.provenance.source ?? "1m candle"} (1m candle sweep)` }, { noMark: true });
        cur = r.state;
        out.push(...r.events);
      }
    }
    if (out.length) commit({ events: out, state: cur });
  }, [sweep.data, commit]);

  // ---------------------------------------------------------------- commands
  const maxAccounts = planOf(plan).limits.paperAccounts;

  const createAccount = useCallback(
    async (capital: number, name: string) => {
      const id = uid();
      const now = Date.now();
      const r = engineCreate({ accountId: id, name: name.trim() || "Paper account", startingCapital: capital, t: now });
      const meta = { id, name: name.trim() || "Paper account", createdAt: now };
      await repo.createAccount(meta, r.events, r.state);
      await repo.setActiveAccountId(id);
      setAccounts((a) => [...a, meta]);
      idRef.current = id;
      stateRef.current = r.state;
      eventsRef.current = r.events;
      setAccountId(id);
      setEvents(r.events);
      setState(r.state);
      if (snapRef.current) commit(processTick(r.state, { ...snapRef.current, t: Math.max(snapRef.current.t, now) }));
    },
    [repo, commit],
  );

  const switchAccount = useCallback(
    async (id: string) => {
      await repo.setActiveAccountId(id);
      await loadAccount(id);
    },
    [repo, loadAccount],
  );

  const placeOrder = useCallback(
    (input: OrderInput): PlaceResult | null => {
      const st = stateRef.current;
      if (!st) return null;
      const r = enginePlace(st, input, snapRef.current, Date.now());
      commit(r);
      return r;
    },
    [commit],
  );

  const cancelOrder = useCallback(
    (orderId: string) => {
      const st = stateRef.current;
      if (st) commit(engineCancel(st, orderId, Date.now()));
    },
    [commit],
  );

  const closePosition = useCallback((): PlaceResult | null => {
    const st = stateRef.current;
    if (!st) return null;
    const r = engineClose(st, snapRef.current, Date.now());
    if (r) commit(r);
    return r;
  }, [commit]);

  const resetAccount = useCallback(
    (capital: number) => {
      const st = stateRef.current;
      if (st) commit(engineReset(st, capital, Date.now()));
    },
    [commit],
  );

  const updateSettings = useCallback(
    (s: AccountSettings) => {
      const st = stateRef.current;
      if (st) commit(engineSettings(st, s, Date.now()));
    },
    [commit],
  );

  const upsert = <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>, item: T) =>
    set((list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]));

  const value: TradeLabCtx = {
    repoKind: repo.kind,
    loading: loading || authLoading,
    error,
    persistError,
    reload: () => setNonce((n) => n + 1),
    accounts,
    accountId,
    events,
    state,
    summary: state ? summarize(state, snapshot?.price ?? null, Date.now()) : null,
    snapshot,
    marketStatus: status,
    streaming,
    venue,
    maxAccounts,
    createAccount,
    switchAccount,
    placeOrder,
    cancelOrder,
    closePosition,
    resetAccount,
    updateSettings,
    journal,
    saveJournal: async (e) => {
      await repo.saveJournal(e);
      upsert(setJournal, e);
    },
    removeJournal: async (id) => {
      await repo.removeJournal(id);
      setJournal((l) => l.filter((x) => x.id !== id));
    },
    replaySessions,
    saveReplaySession: async (s) => {
      await repo.saveReplaySession(s);
      upsert(setReplaySessions, s);
    },
    removeReplaySession: async (id) => {
      await repo.removeReplaySession(id);
      setReplaySessions((l) => l.filter((x) => x.id !== id));
    },
    strategies,
    saveStrategy: async (s) => {
      await repo.saveStrategy(s);
      upsert(setStrategies, s);
    },
    removeStrategy: async (id) => {
      await repo.removeStrategy(id);
      setStrategies((l) => l.filter((x) => x.id !== id));
    },
    backtests,
    saveBacktest: async (b) => {
      await repo.saveBacktest(b);
      upsert(setBacktests, b);
    },
    challenges,
    startChallenge: async (e) => {
      await repo.saveChallenge(e);
      setChallenges((l) => [...l.filter((x) => x.id !== e.id), e]);
    },
    abandonChallenge: async (id) => {
      await repo.removeChallenge(id);
      setChallenges((l) => l.filter((x) => x.id !== id));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
