"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getXrplClient } from "@/lib/xrpl/client";
import { useXrplQuery } from "@/lib/xrpl/hooks";
import { createdAccounts } from "@/lib/xrpl/meta";
import { normalizeTxEnvelope } from "@/lib/xrpl/tx";
import type { AccountInfoResult, AccountLinesResult, AccountOffersResult, AccountTxResult, TrustLine, TxEnvelope } from "@/lib/xrpl/types";

/** Earliest ledger available on full-history servers. */
export const GENESIS_HISTORY_LEDGER = 32570;
/** DeletableAccounts amendment (2020-05-08): new accounts start at Sequence = creation ledger index. */
export const DELETABLE_ACCOUNTS_MS = Date.parse("2020-05-08T00:00:00Z");
export const MAX_FETCHED_TX = 2000;

export function useAccountInfo(address: string | null) {
  return useXrplQuery<AccountInfoResult>(address ? `account_info:${address}` : null, (c) =>
    c.request<AccountInfoResult>("account_info", { account: address, ledger_index: "validated", signer_lists: true }),
  );
}

export function useAccountLines(address: string | null, enabled: boolean) {
  return useXrplQuery<{ lines: TrustLine[]; truncated: boolean }>(address && enabled ? `account_lines:${address}` : null, async (c) => {
    const lines: TrustLine[] = [];
    let marker: unknown = undefined;
    for (let page = 0; page < 5; page++) {
      const r: AccountLinesResult = await c.request<AccountLinesResult>("account_lines", { account: address, ledger_index: "validated", limit: 400, ...(marker ? { marker } : {}) });
      lines.push(...(r.lines ?? []));
      marker = r.marker;
      if (!marker) break;
    }
    return { lines, truncated: !!marker };
  });
}

export function useAccountOffers(address: string | null, enabled: boolean) {
  return useXrplQuery<AccountOffersResult>(address && enabled ? `account_offers:${address}` : null, (c) =>
    c.request<AccountOffersResult>("account_offers", { account: address, ledger_index: "validated", limit: 200 }),
  );
}

export interface FirstTxInfo {
  env: TxEnvelope | null;
  /** Earliest ledger the server searched; > genesis means history may be incomplete. */
  historyFrom: number | null;
  activatedBy: string | null;
  createdAtMs: number | null;
  creationLedger: number | null;
  historyComplete: boolean;
}

/** Account age via the first transaction (account_tx forward, limit 1). Slow / unavailable on non-full-history servers. */
export function useFirstTx(address: string | null, enabled: boolean) {
  return useXrplQuery<FirstTxInfo>(address && enabled ? `first_tx:${address}` : null, async (c) => {
    const r = await c.request<AccountTxResult>("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, forward: true, limit: 1 }, 25_000);
    const env = r.transactions?.length ? normalizeTxEnvelope(r.transactions[0]) : null;
    const historyFrom = typeof r.ledger_index_min === "number" ? r.ledger_index_min : null;
    const created = env ? createdAccounts(env.meta).includes(address!) : false;
    return {
      env,
      historyFrom,
      activatedBy: created && env ? env.tx.Account : null,
      createdAtMs: created && env ? env.closeTimeMs : null,
      creationLedger: created && env ? env.ledgerIndex : null,
      historyComplete: created || (historyFrom !== null && historyFrom <= GENESIS_HISTORY_LEDGER),
    };
  });
}

export interface AccountTxState {
  envs: TxEnvelope[];
  loading: boolean;
  error: (Error & { code?: string }) | null;
  hasMore: boolean;
  server: string | null;
  loadMore: () => void;
  reload: () => void;
}

/** Paginated account_tx (newest first) with marker; accumulates up to MAX_FETCHED_TX. */
export function useAccountTx(address: string | null, pageSize = 200): AccountTxState {
  const [envs, setEnvs] = useState<TxEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<(Error & { code?: string }) | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [server, setServer] = useState<string | null>(null);
  const marker = useRef<unknown>(undefined);
  const gen = useRef(0);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!address) return;
      const my = reset ? ++gen.current : gen.current;
      if (reset) {
        marker.current = undefined;
        setEnvs([]);
        setHasMore(true);
      }
      setLoading(true);
      setError(null);
      const c = getXrplClient();
      try {
        const r = await c.request<AccountTxResult>(
          "account_tx",
          { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: pageSize, forward: false, ...(marker.current ? { marker: marker.current } : {}) },
          25_000,
        );
        if (my !== gen.current) return;
        const page = (r.transactions ?? []).map(normalizeTxEnvelope).filter((e): e is TxEnvelope => e !== null);
        marker.current = r.marker;
        setEnvs((prev) => {
          const seen = new Set(prev.map((e) => e.hash));
          return [...prev, ...page.filter((e) => !seen.has(e.hash))].slice(0, MAX_FETCHED_TX);
        });
        setHasMore(!!r.marker);
      } catch (e) {
        if (my === gen.current) setError(e as Error & { code?: string });
      } finally {
        if (my === gen.current) {
          setLoading(false);
          setServer(c.server);
        }
      }
    },
    [address, pageSize],
  );

  useEffect(() => {
    void fetchPage(true);
  }, [fetchPage]);

  return {
    envs,
    loading,
    error,
    hasMore: hasMore && envs.length < MAX_FETCHED_TX,
    server,
    loadMore: () => void fetchPage(false),
    reload: () => void fetchPage(true),
  };
}

/** Estimated number of transactions SENT by the account, from its Sequence. */
export function sentTxEstimate(sequence: number, first: FirstTxInfo | undefined): { value: number | null; note: string } {
  if (!first || first.creationLedger === null || first.createdAtMs === null)
    return {
      value: null,
      note: `Sequence ${sequence.toLocaleString("en-US")}. A sent-transaction estimate needs the account's creation ledger (unavailable from this server).`,
    };
  const start = first.createdAtMs >= DELETABLE_ACCOUNTS_MS ? first.creationLedger : 1;
  const v = Math.max(0, sequence - start);
  return {
    value: v,
    note: `≈ Sequence ${sequence.toLocaleString("en-US")} − starting sequence ${start.toLocaleString("en-US")}${start > 1 ? " (accounts created after the DeletableAccounts amendment start at their creation ledger index)" : ""}. Tickets also consume sequence numbers; received transactions are not included.`,
  };
}
