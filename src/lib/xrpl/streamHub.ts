"use client";

import { rippleTimeToMs } from "@/lib/format";
import { getXrplClient, type XrplConnState } from "./client";
import { applyLedgerClosed, applyTx, emptyLedgerStat, type LedgerStat } from "./activity";
import { normalizeTxEnvelope } from "./tx";
import { toWhalePayment, WHALE_BUFFER_MIN, type WhalePayment } from "./whales";
import type { LedgerClosedMsg } from "./types";

/**
 * Shared, ref-counted subscription to the XRPL `ledger` and `transactions` streams.
 * Several widgets/pages can listen at once without duplicate subscriptions, and they all see
 * the same honest session window ("listening since …"). Nothing is backfilled.
 */

export type StreamName = "ledger" | "transactions";

export interface LedgerHeader {
  ledgerIndex: number;
  closeTimeMs: number | null;
  txnCount: number | null;
  feeBaseDrops: number | null;
  reserveBaseDrops: number | null;
  reserveIncDrops: number | null;
  receivedAt: number;
}

export interface SessionSnapshot {
  connState: XrplConnState;
  server: string | null;
  /** When the ledger stream session started */
  startedAt: number | null;
  ledgersObserved: number;
  /** When the transactions stream (whales/activity data) started — tx-derived data covers only this window */
  txStartedAt: number | null;
  /** Ledgers closed since txStartedAt */
  txLedgers: number;
  /** Ledger-index discontinuities (e.g. after a reconnect) — shown to users. */
  gaps: number;
  ledgers: LedgerHeader[]; // newest first
  stats: LedgerStat[]; // oldest → newest
  whales: WhalePayment[]; // newest first, ≥ WHALE_BUFFER_MIN XRP
  txObserved: number;
  lastMessageAt: number | null;
  error: string | null;
  subscribed: Record<StreamName, boolean>;
  version: number;
}

const MAX_HEADERS = 60;
const MAX_STATS = 1500;
const MAX_WHALES = 1000;
const RELEASE_GRACE_MS = 30_000;
const FLUSH_MS = 400;

type Listener = () => void;

class XrplStreamHub {
  private refs: Record<StreamName, number> = { ledger: 0, transactions: 0 };
  private subscribed: Record<StreamName, boolean> = { ledger: false, transactions: false };
  private releaseTimers: Partial<Record<StreamName, ReturnType<typeof setTimeout>>> = {};
  private listeners = new Set<Listener>();
  private attached = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private connState: XrplConnState = "idle";
  private server: string | null = null;
  private startedAt: number | null = null;
  private ledgersObserved = 0;
  private txStartedAt: number | null = null;
  private txLedgers = 0;
  private gaps = 0;
  private lastLedger: number | null = null;
  private headers: LedgerHeader[] = [];
  private stats = new Map<number, LedgerStat>();
  private whales: WhalePayment[] = [];
  private txObserved = 0;
  private lastMessageAt: number | null = null;
  private error: string | null = null;
  private version = 0;
  private snapshot: SessionSnapshot = this.build();

  private build(): SessionSnapshot {
    const stats = [...this.stats.values()].sort((a, b) => a.ledgerIndex - b.ledgerIndex);
    return {
      connState: this.connState,
      server: this.server,
      startedAt: this.startedAt,
      ledgersObserved: this.ledgersObserved,
      txStartedAt: this.txStartedAt,
      txLedgers: this.txLedgers,
      gaps: this.gaps,
      ledgers: [...this.headers],
      stats,
      whales: [...this.whales],
      txObserved: this.txObserved,
      lastMessageAt: this.lastMessageAt,
      error: this.error,
      subscribed: { ...this.subscribed },
      version: this.version,
    };
  }

  private emit(immediate = false) {
    const run = () => {
      this.flushTimer = null;
      this.version++;
      this.snapshot = this.build();
      this.listeners.forEach((l) => l());
    };
    if (immediate) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      run();
      return;
    }
    if (!this.flushTimer) this.flushTimer = setTimeout(run, FLUSH_MS);
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribeStore = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private attach() {
    if (this.attached) return;
    this.attached = true;
    const client = getXrplClient();
    this.connState = client.state;
    this.server = client.server;
    client.onState((s, server) => {
      this.connState = s;
      this.server = server ?? client.server;
      if (s === "connected") this.error = null;
      if (s === "failed") this.error = "No XRPL server reachable";
      this.emit(true);
    });
    client.onMessage((msg) => this.onMessage(msg));
  }

  private statFor(idx: number): LedgerStat {
    let s = this.stats.get(idx);
    if (!s) {
      s = emptyLedgerStat(idx);
      this.stats.set(idx, s);
      if (this.stats.size > MAX_STATS) {
        const oldest = Math.min(...this.stats.keys());
        this.stats.delete(oldest);
      }
    }
    return s;
  }

  private onMessage(msg: Record<string, unknown>) {
    if (!this.startedAt) return; // not listening
    const now = Date.now();
    if (msg.type === "ledgerClosed" && this.subscribed.ledger) {
      const m = msg as unknown as LedgerClosedMsg;
      if (typeof m.ledger_index !== "number") return;
      this.lastMessageAt = now;
      if (this.lastLedger !== null && m.ledger_index > this.lastLedger + 1) this.gaps++;
      if (this.lastLedger === null || m.ledger_index > this.lastLedger) this.lastLedger = m.ledger_index;
      this.ledgersObserved++;
      if (this.subscribed.transactions && this.txStartedAt) this.txLedgers++;
      const h: LedgerHeader = {
        ledgerIndex: m.ledger_index,
        closeTimeMs: typeof m.ledger_time === "number" ? rippleTimeToMs(m.ledger_time) : null,
        txnCount: m.txn_count ?? null,
        feeBaseDrops: m.fee_base ?? null,
        reserveBaseDrops: m.reserve_base ?? null,
        reserveIncDrops: m.reserve_inc ?? null,
        receivedAt: now,
      };
      this.headers = [h, ...this.headers.filter((x) => x.ledgerIndex !== h.ledgerIndex)].slice(0, MAX_HEADERS);
      if (this.subscribed.transactions) applyLedgerClosed(this.statFor(m.ledger_index), m);
      this.emit();
      return;
    }
    if (msg.type === "transaction" && this.subscribed.transactions && this.txStartedAt) {
      if (msg.validated === false) return;
      const env = normalizeTxEnvelope(msg);
      if (!env || env.ledgerIndex === null) return;
      this.lastMessageAt = now;
      this.txObserved++;
      const s = this.statFor(env.ledgerIndex);
      if (!env.closeTimeMs && s.closeTimeMs) env.closeTimeMs = s.closeTimeMs;
      applyTx(s, env);
      const w = toWhalePayment(env, WHALE_BUFFER_MIN, now);
      if (w) this.whales = [w, ...this.whales].slice(0, MAX_WHALES);
      this.emit();
    }
  }

  private async doSubscribe(s: StreamName) {
    const client = getXrplClient();
    try {
      const res = await client.subscribe({ streams: [s] });
      this.subscribed[s] = true;
      if (!this.startedAt) this.startedAt = Date.now();
      if (s === "transactions" && !this.txStartedAt) {
        this.clearTxData();
        this.txStartedAt = Date.now();
      }
      this.error = null;
      // The ledger subscribe response carries the current validated ledger header.
      if (s === "ledger" && res && typeof (res as Record<string, unknown>).ledger_index === "number") {
        const r = res as unknown as LedgerClosedMsg;
        const h: LedgerHeader = {
          ledgerIndex: r.ledger_index,
          closeTimeMs: typeof r.ledger_time === "number" ? rippleTimeToMs(r.ledger_time) : null,
          txnCount: null,
          feeBaseDrops: r.fee_base ?? null,
          reserveBaseDrops: r.reserve_base ?? null,
          reserveIncDrops: r.reserve_inc ?? null,
          receivedAt: Date.now(),
        };
        if (!this.headers.some((x) => x.ledgerIndex === h.ledgerIndex)) this.headers = [h, ...this.headers].slice(0, MAX_HEADERS);
        this.lastLedger = Math.max(this.lastLedger ?? 0, r.ledger_index);
      }
    } catch (e) {
      // The client keeps the subscription and re-applies it after any successful (re)connect.
      this.subscribed[s] = client.state === "connected";
      this.error = (e as Error).message || "Subscription failed";
    }
    this.emit(true);
  }

  private clearTxData() {
    this.stats.clear();
    this.whales = [];
    this.txObserved = 0;
    this.txLedgers = 0;
    this.txStartedAt = null;
  }

  private reset() {
    this.clearTxData();
    this.startedAt = null;
    this.ledgersObserved = 0;
    this.gaps = 0;
    this.lastLedger = null;
    this.headers = [];
    this.lastMessageAt = null;
  }

  /** Start listening to the given streams. Returns a release function. */
  acquire(streams: StreamName[]): () => void {
    this.attach();
    for (const s of streams) {
      this.refs[s]++;
      const t = this.releaseTimers[s];
      if (t) {
        clearTimeout(t);
        delete this.releaseTimers[s];
      }
      if (this.refs[s] === 1 && !this.subscribed[s]) void this.doSubscribe(s);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const s of streams) {
        this.refs[s] = Math.max(0, this.refs[s] - 1);
        if (this.refs[s] === 0) {
          this.releaseTimers[s] = setTimeout(() => {
            delete this.releaseTimers[s];
            if (this.refs[s] > 0) return;
            this.subscribed[s] = false;
            void getXrplClient().unsubscribe({ streams: [s] });
            // tx-derived data would have a hole — drop it rather than present a misleading window
            if (s === "transactions") this.clearTxData();
            if (!this.subscribed.ledger && !this.subscribed.transactions) this.reset();
            this.emit(true);
          }, RELEASE_GRACE_MS);
        }
      }
    };
  }

  /** Manual retry after all servers failed. */
  retry() {
    const client = getXrplClient();
    this.error = null;
    this.emit(true);
    client
      .connect()
      .then(() => {
        (Object.keys(this.refs) as StreamName[]).forEach((s) => {
          if (this.refs[s] > 0 && !this.subscribed[s]) void this.doSubscribe(s);
        });
      })
      .catch((e: Error) => {
        this.error = e.message;
        this.emit(true);
      });
  }
}

let hub: XrplStreamHub | null = null;
export function getStreamHub(): XrplStreamHub {
  if (!hub) hub = new XrplStreamHub();
  return hub;
}
export type { XrplStreamHub };
