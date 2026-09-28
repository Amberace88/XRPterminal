"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPost } from "@/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";
import { getAccountsRepo, getLotsRepo } from "@/lib/portfolio/repo";
import type { ConnectedAccount, ExchangeBalance, Lot } from "@/lib/portfolio/types";
import { aggregateHoldings, type AccountHolding, type TokenHolding } from "@/lib/portfolio/holdings";
import { getXrplClient } from "@/lib/xrpl/client";
import { dropsToXrpString, displayCurrency } from "@/lib/xrpl/amount";
import { normalizeTxEnvelope } from "@/lib/xrpl/tx";
import type { AccountInfoResult, AccountLinesResult, AccountTxResult, ServerInfoResult } from "@/lib/xrpl/types";

const ACCOUNTS_EVENT = "xrpt-portfolio-accounts";
const LOTS_EVENT = "xrpt-portfolio-lots";
const emit = (name: string) => {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    /* ignore */
  }
};

/** Connected accounts (guest: browser; signed in: server API with plan limits). */
export function useConnectedAccounts() {
  const { user, loading: authLoading } = useAuth();
  const repo = useMemo(() => getAccountsRepo(user?.id ?? null), [user?.id]);
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    repo
      .list()
      .then((a) => {
        setAccounts(a);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setAccounts((prev) => prev ?? []);
      });
  }, [repo]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
    window.addEventListener(ACCOUNTS_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNTS_EVENT, refresh);
  }, [refresh, authLoading]);

  return {
    accounts,
    error,
    storage: repo.kind,
    refresh,
    addWallet: async (input: { input: string; classic: string; tag?: number | null; label: string }) => {
      const a = await repo.addWallet(input);
      emit(ACCOUNTS_EVENT);
      return a;
    },
    update: async (id: string, patch: { label?: string; isPrimary?: boolean }) => {
      await repo.update(id, patch);
      emit(ACCOUNTS_EVENT);
    },
    remove: async (id: string) => {
      await repo.remove(id);
      emit(ACCOUNTS_EVENT);
    },
    notifyChanged: () => emit(ACCOUNTS_EVENT),
  };
}

export interface HoldingsState {
  holdings: AccountHolding[];
  loading: boolean;
  updatedAt: number | null;
  server: string | null;
  reserve: { base: number; inc: number } | null;
  reload: () => void;
}

async function xrplHolding(a: ConnectedAccount, reserve: { base: number; inc: number } | null): Promise<AccountHolding> {
  const c = getXrplClient();
  const info = await c.request<AccountInfoResult>("account_info", { account: a.address, ledger_index: "validated" });
  const lines = await c.request<AccountLinesResult>("account_lines", { account: a.address, ledger_index: "validated", limit: 400 }).catch(() => ({ lines: [] }) as unknown as AccountLinesResult);
  const tokens: TokenHolding[] = (lines.lines ?? [])
    .filter((l) => Number(l.balance) > 0)
    .map((l) => ({ key: `${l.currency}.${l.account}`, currency: displayCurrency(l.currency), issuer: l.account, amount: Number(l.balance), source: a.label || a.address!, valued: false as const }));
  const d = info.account_data;
  return {
    accountId: a.id,
    label: a.label || a.address!,
    kind: "XRPL_WALLET",
    xrp: Number(dropsToXrpString(d.Balance)),
    reserveXrp: reserve ? reserve.base + d.OwnerCount * reserve.inc : undefined,
    tokens,
  };
}

async function exchangeHolding(a: ConnectedAccount): Promise<AccountHolding> {
  const r = await apiPost<{ balances: ExchangeBalance[]; syncedAt: number }>("/api/portfolio/exchange/sync", { id: a.id });
  let xrp = 0;
  const tokens: TokenHolding[] = [];
  for (const b of r.balances) {
    const amt = Number(b.free) + Number(b.locked);
    if (b.asset === "XRP") xrp += amt;
    else tokens.push({ key: `${a.exchange}:${b.asset}`, currency: b.asset, issuer: null, amount: amt, source: a.label || "Exchange", valued: false });
  }
  return { accountId: a.id, label: a.label || "Exchange", kind: "EXCHANGE_ACCOUNT", xrp, tokens, lastActivityMs: r.syncedAt };
}

/** Live holdings for all connected accounts. Failures are per account (never break the whole page). */
export function useHoldings(accounts: ConnectedAccount[] | null): HoldingsState {
  const [holdings, setHoldings] = useState<AccountHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [reserve, setReserve] = useState<{ base: number; inc: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = (accounts ?? []).map((a) => `${a.id}:${a.address ?? ""}`).join("|");

  useEffect(() => {
    if (!accounts) return;
    const active = accounts.filter((a) => a.type === "XRPL_WALLET" || a.type === "EXCHANGE_ACCOUNT");
    if (!active.length) {
      setHoldings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let rsv: { base: number; inc: number } | null = null;
      if (active.some((a) => a.type === "XRPL_WALLET")) {
        try {
          const si = await getXrplClient().request<ServerInfoResult>("server_info");
          const v = si.info.validated_ledger;
          if (v?.reserve_base_xrp !== undefined && v.reserve_inc_xrp !== undefined) rsv = { base: v.reserve_base_xrp, inc: v.reserve_inc_xrp };
        } catch {
          /* reserve optional */
        }
      }
      const results = await Promise.allSettled(active.map((a) => (a.type === "XRPL_WALLET" ? xrplHolding(a, rsv) : exchangeHolding(a))));
      if (cancelled) return;
      setReserve(rsv);
      setHoldings(
        results.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { accountId: active[i].id, label: active[i].label || active[i].address || "Account", kind: active[i].type as "XRPL_WALLET" | "EXCHANGE_ACCOUNT", xrp: 0, tokens: [], error: (r.reason as Error)?.message ?? "Failed" },
        ),
      );
      setServer(getXrplClient().server);
      setUpdatedAt(Date.now());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { holdings, loading, updatedAt, server, reserve, reload: () => setNonce((n) => n + 1) };
}

export function useAggregate(h: AccountHolding[]) {
  return useMemo(() => aggregateHoldings(h), [h]);
}

/** Cost-basis lots (guest: browser; signed in: Supabase with RLS). */
export function useLots() {
  const { user, loading: authLoading } = useAuth();
  const repo = useMemo(() => getLotsRepo(user?.id ?? null), [user?.id]);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    repo
      .list()
      .then((l) => {
        setLots(l);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLots((p) => p ?? []);
      });
  }, [repo]);
  useEffect(() => {
    if (authLoading) return;
    refresh();
    window.addEventListener(LOTS_EVENT, refresh);
    return () => window.removeEventListener(LOTS_EVENT, refresh);
  }, [refresh, authLoading]);
  return {
    lots,
    error,
    storage: repo.kind,
    save: async (l: Lot) => {
      await repo.save(l);
      emit(LOTS_EVENT);
    },
    remove: async (id: string) => {
      await repo.remove(id);
      emit(LOTS_EVENT);
    },
  };
}

/** Last activity of an XRPL address (most recent validated transaction). */
export async function fetchLastActivity(address: string): Promise<{ timeMs: number | null; hash: string | null; type: string | null }> {
  const r = await getXrplClient().request<AccountTxResult>("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 1, forward: false });
  const e = r.transactions?.length ? normalizeTxEnvelope(r.transactions[0]) : null;
  return { timeMs: e?.closeTimeMs ?? null, hash: e?.hash ?? null, type: e?.tx.TransactionType ?? null };
}
