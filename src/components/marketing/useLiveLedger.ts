"use client";

import { useEffect, useSyncExternalStore } from "react";
import { XrplClient, type XrplConnState } from "@/lib/xrpl/client";
import { rippleTimeToMs } from "@/lib/format";

/**
 * Shared subscription to the XRPL "ledger" stream (validated ledgers) for marketing
 * pages. One dedicated socket regardless of how many components listen (kept separate
 * from the terminal's shared client so closing it never affects terminal streams).
 * Data comes straight from public XRPL servers — nothing is simulated.
 */
export interface LedgerClose {
  index: number;
  hash: string;
  closeTime: number; // ms
  txnCount: number | null;
  receivedAt: number;
}

interface State {
  ledgers: LedgerClose[];
  conn: XrplConnState;
  server: string | null;
  error: string | null;
}

let state: State = { ledgers: [], conn: "idle", server: null, error: null };
const listeners = new Set<() => void>();
let refs = 0;
let started = false;
let client: XrplClient | null = null;
let offMsg: (() => void) | null = null;
let offState: (() => void) | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function push(l: LedgerClose) {
  if (state.ledgers[0]?.index === l.index) return;
  if (state.ledgers[0] && l.index < state.ledgers[0].index) return;
  emit({ ledgers: [l, ...state.ledgers].slice(0, 8), error: null });
}

function start() {
  if (started) return;
  started = true;
  client = new XrplClient();
  offState = client.onState((s, server) => emit({ conn: s, server: server ?? null })) as () => void;
  offMsg = client.onMessage((msg) => {
    if (msg.type !== "ledgerClosed") return;
    push({
      index: Number(msg.ledger_index),
      hash: String(msg.ledger_hash ?? ""),
      closeTime: rippleTimeToMs(Number(msg.ledger_time)),
      txnCount: typeof msg.txn_count === "number" ? msg.txn_count : null,
      receivedAt: Date.now(),
    });
  }) as () => void;
  client
    .subscribe({ streams: ["ledger"] })
    .then((r) => {
      const res = r as Record<string, unknown>;
      if (typeof res.ledger_index === "number") {
        push({
          index: res.ledger_index,
          hash: String(res.ledger_hash ?? ""),
          closeTime: rippleTimeToMs(Number(res.ledger_time)),
          txnCount: null,
          receivedAt: Date.now(),
        });
      }
    })
    .catch((e: unknown) => emit({ error: e instanceof Error ? e.message : "XRPL connection failed", conn: "failed" }));
}

function stop() {
  if (!started) return;
  started = false;
  offMsg?.();
  offState?.();
  client?.close();
  client = null;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLiveLedger(): State {
  useEffect(() => {
    refs++;
    if (stopTimer) clearTimeout(stopTimer);
    start();
    return () => {
      refs--;
      if (refs <= 0) stopTimer = setTimeout(stop, 5000);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
