import { describe, expect, it } from "vitest";
import { findChallengeTx, generateChallengeCode, hexToUtf8, utf8ToHex } from "@/lib/social/verification";
import { dominantQuote, extractDexFills, fifoRoundTrips } from "@/lib/social/onchain";
import { computeTraderMetrics, leaderboardScore, MIN_TRADES, rankTraders, simulateMimic } from "@/lib/social/metrics";
import type { ClosedTrade } from "@/lib/social/types";

const ADDR = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const RIPPLE_EPOCH = 946684800;
const t = (ms: number) => Math.floor(ms / 1000) - RIPPLE_EPOCH;

describe("trader verification", () => {
  it("generates codes and round-trips memo hex", () => {
    const code = generateChallengeCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toMatch(/^XRPT-[A-Z2-9]{10}$/);
    expect(hexToUtf8(utf8ToHex(code))).toBe(code);
  });
  it("finds a validated memo transaction sent from the address inside the window", () => {
    const now = Date.UTC(2026, 8, 28);
    const code = "XRPT-ABCDEFGHJK";
    const entries = [
      { tx: { Account: "rOther", Memos: [{ Memo: { MemoData: utf8ToHex(code) } }], date: t(now) }, meta: { TransactionResult: "tesSUCCESS" }, validated: true, hash: "A" },
      { tx: { Account: ADDR, Memos: [{ Memo: { MemoData: utf8ToHex(code) } }], date: t(now) }, meta: { TransactionResult: "tecNO_DST" }, validated: true, hash: "B" },
      { tx: { Account: ADDR, Memos: [{ Memo: { MemoData: utf8ToHex("hello") } }], date: t(now) }, meta: { TransactionResult: "tesSUCCESS" }, validated: true, hash: "C" },
      { tx_json: { Account: ADDR, Memos: [{ Memo: { MemoData: utf8ToHex(`verify ${code.toLowerCase()}`) } }], date: t(now) }, meta: { TransactionResult: "tesSUCCESS" }, validated: true, hash: "D", ledger_index: 99 },
    ];
    const m = findChallengeTx(entries, { address: ADDR, code, notBefore: now - 3600_000, notAfter: now + 3600_000 });
    expect(m?.hash).toBe("D");
    expect(m?.ledgerIndex).toBe(99);
    expect(findChallengeTx(entries, { address: ADDR, code, notBefore: now + 1000, notAfter: now + 5000 })).toBeNull();
  });
});

describe("on-chain DEX fills and FIFO round trips", () => {
  const USD = { currency: "USD", issuer: "rIssuer" };
  function fillTx(hash: string, when: number, xrpDeltaDrops: number, usdDelta: number, fee = 12) {
    const prevXrp = 100_000_000_000;
    return {
      tx: { Account: ADDR, TransactionType: "OfferCreate", Fee: String(fee), date: t(when) },
      meta: {
        TransactionResult: "tesSUCCESS",
        AffectedNodes: [
          { ModifiedNode: { LedgerEntryType: "AccountRoot", FinalFields: { Account: ADDR, Balance: String(prevXrp + xrpDeltaDrops - fee) }, PreviousFields: { Balance: String(prevXrp) } } },
          {
            ModifiedNode: {
              LedgerEntryType: "RippleState",
              FinalFields: { Balance: { currency: "USD", issuer: "rrrrrrrrrrrrrrrrrrrrBZbvji", value: String(1000 + usdDelta) }, LowLimit: { issuer: ADDR, currency: "USD", value: "1e9" }, HighLimit: { issuer: USD.issuer, currency: "USD", value: "0" } },
              PreviousFields: { Balance: { currency: "USD", issuer: "rrrrrrrrrrrrrrrrrrrrBZbvji", value: "1000" } },
            },
          },
        ],
      },
      validated: true,
      hash,
    };
  }
  it("extracts buy/sell fills and computes FIFO P&L", () => {
    const d = 86_400_000;
    const t0 = Date.UTC(2026, 0, 1);
    const entries = [
      fillTx("B1", t0, 1000_000_000, -500), // buy 1000 XRP for 500 USD (0.50)
      fillTx("B2", t0 + d, 1000_000_000, -600), // buy 1000 @ 0.60
      fillTx("S1", t0 + 2 * d, -1500_000_000, 1050), // sell 1500 @ 0.70
    ];
    const fills = extractDexFills(entries, ADDR);
    expect(fills.map((f) => f.side)).toEqual(["BUY", "BUY", "SELL"]);
    expect(fills[0].price).toBeCloseTo(0.5, 10); // fee excluded
    const q = dominantQuote(fills)!;
    expect(q).toBe("USD.rIssuer");
    const trades = fifoRoundTrips(fills, q);
    expect(trades).toHaveLength(1);
    // cost = 1000*0.5 + 500*0.6 = 800 ; proceeds = 1050
    expect(trades[0].qty).toBeCloseTo(1500);
    expect(trades[0].pnl).toBeCloseTo(250);
    expect(trades[0].entryPrice).toBeCloseTo(800 / 1500);
  });
  it("ignores plain payments to others", () => {
    const e = { tx: { Account: ADDR, TransactionType: "Payment", Destination: "rDest", Fee: "10", date: t(Date.now()) }, meta: { TransactionResult: "tesSUCCESS", AffectedNodes: [] }, validated: true, hash: "P" };
    expect(extractDexFills([e], ADDR)).toHaveLength(0);
  });
});

describe("trader metrics & leaderboard", () => {
  const day = 86_400_000;
  const mk = (i: number, r: number): ClosedTrade => ({ entryTime: i * 3 * day, exitTime: i * 3 * day + day, qty: 100, entryPrice: 1, exitPrice: 1 + r / 100, pnl: r, returnPct: r, holdingMs: day });
  it("requires a minimum sample before scoring", () => {
    const few = computeTraderMetrics([mk(0, 5), mk(1, -2)]);
    expect(few.eligible).toBe(false);
    expect(few.score).toBeNull();
    expect(few.ineligibleReason).toMatch(/minimum/);
  });
  it("computes win rate, drawdown and a composite score (not ROI-only)", () => {
    const trades = Array.from({ length: MIN_TRADES + 5 }, (_, i) => mk(i, i % 3 === 0 ? -2 : 3));
    const m = computeTraderMetrics(trades);
    expect(m.eligible).toBe(true);
    expect(m.winRate).toBeCloseTo(16 / 25);
    expect(m.maxDrawdownPct).toBeGreaterThan(0);
    expect(m.score).toBeGreaterThan(0);
    expect(m.score).toBeLessThanOrEqual(100);
    // a higher-ROI but much riskier profile should not automatically rank first
    const risky = computeTraderMetrics(Array.from({ length: MIN_TRADES + 5 }, (_, i) => mk(i, i % 2 === 0 ? 50 : -25)));
    expect((risky.roiPct ?? 0) > (m.roiPct ?? 0)).toBe(true);
    const ranked = rankTraders([{ id: "risky", metrics: risky }, { id: "steady", metrics: m }, { id: "tiny", metrics: computeTraderMetrics([mk(0, 50)]) }]);
    expect(ranked.map((r) => r.id)).toEqual(["steady", "risky"]); // tiny excluded
    expect(leaderboardScore({ riskAdjusted: null, consistency: null, maxDrawdownPct: null, profitFactor: null, tradeCount: 1 })).toBeGreaterThan(0);
  });
  it("simulates a hypothetical mimic with fees and slippage", () => {
    const res = simulateMimic([mk(0, 10)], { capital: 1000, allocationPct: 50, feePct: 0.1, slippageBps: 10 });
    expect(res.rows).toHaveLength(1);
    expect(res.totalFees).toBeGreaterThan(0);
    expect(res.totalSlippage).toBeGreaterThan(0);
    // without costs the result would be +50 (10% of 500)
    expect(res.endEquity - 1000).toBeLessThan(50);
    expect(res.endEquity - 1000).toBeGreaterThan(45);
  });
});
