import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A, B, C, hash, rippleSec, xrpPaymentMeta } from "./xrpl-fixtures";

/** Fake shared client: records subscriptions and lets the test push stream messages. */
const handlers = new Set<(m: Record<string, unknown>) => void>();
const fake = {
  state: "connected" as const,
  server: "wss://test.invalid",
  subscribe: vi.fn(async (p: { streams: string[] }) => (p.streams[0] === "ledger" ? { ledger_index: 99_999_999, ledger_time: rippleSec("2026-09-28T10:00:00Z"), fee_base: 10, reserve_base: 1_000_000, reserve_inc: 200_000 } : {})),
  unsubscribe: vi.fn(async () => ({})),
  onMessage: (h: (m: Record<string, unknown>) => void) => {
    handlers.add(h);
    return () => handlers.delete(h);
  },
  onState: () => () => undefined,
  connect: async () => undefined,
};
vi.mock("@/lib/xrpl/client", () => ({ getXrplClient: () => fake }));

const push = (m: Record<string, unknown>) => handlers.forEach((h) => h(m));

describe("XRPL stream hub (live session aggregation)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ref-counts subscriptions, aggregates tx + ledgers, keeps only delivered-amount whales", async () => {
    const { getStreamHub } = await import("@/lib/xrpl/streamHub");
    const hub = getStreamHub();
    const r1 = hub.acquire(["ledger", "transactions"]);
    const r2 = hub.acquire(["transactions"]);
    await vi.runOnlyPendingTimersAsync();
    expect(fake.subscribe).toHaveBeenCalledTimes(2); // one per stream, not per consumer

    // v1 shape: 2,000,000 XRP delivered → whale
    push({
      type: "transaction",
      validated: true,
      ledger_index: 100_000_000,
      meta: xrpPaymentMeta(A, B, "3000000000000", "999999999988", null, "2000000000000", "2000000000000"), // creates B
      transaction: { TransactionType: "Payment", Account: A, Destination: B, Amount: "2000000000000", Fee: "12", Sequence: 1, hash: hash(900), date: rippleSec("2026-09-28T10:00:03Z") },
    });
    // v2 shape: partial payment stating 5M XRP but delivering 1 XRP → NOT a whale
    push({
      type: "transaction",
      validated: true,
      ledger_index: 100_000_000,
      hash: hash(901),
      close_time_iso: "2026-09-28T10:00:03Z",
      meta: xrpPaymentMeta(B, C, "10000000", "8999988", "0", "1000000", "1000000"),
      tx_json: { TransactionType: "Payment", Account: B, Destination: C, DeliverMax: "5000000000000", Flags: 0x00020000, Fee: "12", Sequence: 2 },
    });
    push({ type: "ledgerClosed", ledger_index: 100_000_000, ledger_time: rippleSec("2026-09-28T10:00:03Z"), txn_count: 2, fee_base: 10, reserve_base: 1_000_000, reserve_inc: 200_000 });
    await vi.advanceTimersByTimeAsync(500);

    const s = hub.getSnapshot();
    expect(s.txStartedAt).not.toBeNull();
    expect(s.txLedgers).toBe(1);
    expect(s.ledgers[0].ledgerIndex).toBe(100_000_000);
    expect(s.whales.map((w) => w.amountXrp)).toEqual([2_000_000]);
    const st = s.stats.find((x) => x.ledgerIndex === 100_000_000)!;
    expect(st.observedTx).toBe(2);
    expect(st.txnCount).toBe(2);
    expect(st.newAccounts).toBe(1);

    // releasing one consumer keeps the stream; releasing all unsubscribes after the grace period and drops tx data
    r2();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    r1();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fake.unsubscribe).toHaveBeenCalledTimes(2);
    const after = hub.getSnapshot();
    expect(after.whales).toEqual([]);
    expect(after.txStartedAt).toBeNull();
    expect(after.startedAt).toBeNull();
  });
});
