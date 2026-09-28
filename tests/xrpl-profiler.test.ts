import { describe, expect, it } from "vitest";
import { isValidClassicAddress } from "ripple-address-codec";
import { classifyWallet, PROFILE_RULES, type ProfileInput } from "@/lib/xrpl/profiler";
import { walletRiskSignals } from "@/lib/xrpl/risk";
import { indexLabels, parseWellKnown } from "@/lib/xrpl/labels";
import type { TrustLine, TxEnvelope } from "@/lib/xrpl/types";
import { A, B, C, env, okMeta, xrpPaymentMeta } from "./xrpl-fixtures";

const NOW = Date.parse("2026-09-28T00:00:00Z");
const base = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  address: A,
  balanceXrp: 50,
  txs: [],
  completeHistory: false,
  lines: [],
  accountFlags: [],
  hasAmmId: false,
  createdAtMs: null,
  externalLabels: [],
  now: NOW,
  ...over,
});

function offers(n: number, days: number): TxEnvelope[] {
  return Array.from({ length: n }, (_, i) =>
    env(1000 + i, { TransactionType: "OfferCreate", Account: A, TakerGets: "1000000", TakerPays: { currency: "USD", issuer: B, value: "1" } }, okMeta(), {
      time: new Date(NOW - 12 * 3_600_000 - (i % days) * 86_400_000 - i * 1000).toISOString(),
      ledger: 1000 + i,
    }),
  );
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe("wallet profiler", () => {
  it("never emits 'smart money' and whale always carries the balance caveat", () => {
    const r = classifyWallet(base({ balanceXrp: 25_000_000 }));
    expect(ids(r)).toContain("whale");
    expect(JSON.stringify(r).toLowerCase()).not.toContain("smart money");
    expect(r.find((x) => x.id === "whale")!.explanation).toMatch(/says nothing about skill/);
  });

  it("active trader requires enough OfferCreates across enough days, with explanation", () => {
    const r = classifyWallet(base({ txs: offers(25, 5) }));
    const t = r.find((x) => x.id === "active-trader")!;
    expect(t.explanation).toBe("Classified as active trader because of 25 OfferCreate transactions across 5 days within the last 25 fetched transactions.");
    expect(ids(classifyWallet(base({ txs: offers(25, 1) })))).not.toContain("active-trader");
    expect(ids(classifyWallet(base({ txs: offers(PROFILE_RULES.traderMinOffers - 1, 5) })))).not.toContain("active-trader");
  });

  it("issuer from negative trust-line balances; liquidity participant from AMM / LP tokens", () => {
    const lines: TrustLine[] = [
      { account: B, balance: "-100", currency: "USD", limit: "0", limit_peer: "1000" },
      { account: C, balance: "5", currency: "03AB00000000000000000000000000000000CDEF", limit: "0", limit_peer: "0" },
    ];
    const r = classifyWallet(base({ lines }));
    expect(ids(r)).toEqual(expect.arrayContaining(["issuer", "liquidity-participant"]));
    expect(ids(classifyWallet(base({ hasAmmId: true })))).toContain("liquidity-participant");
  });

  it("exchange-related from external label, or tagged-deposit heuristic marked as such", () => {
    const labels = parseWellKnown([{ account: A, name: "Bitstamp", desc: "hot", verified: true }], isValidClassicAddress);
    const r = classifyWallet(base({ externalLabels: labels }));
    expect(r.find((x) => x.id === "exchange-related")?.basis).toBe("external-label");

    // 30 tagged deposits from 30 distinct senders (only distinctness matters for the heuristic)
    const deposits = Array.from({ length: 30 }, (_, i) =>
      env(2000 + i, { TransactionType: "Payment", Account: `sender-${i}`, Destination: A, Amount: "1000000", DestinationTag: i }, xrpPaymentMeta(B, A, "10000000", "8999988", "1", "1000001", "1000000")),
    );
    const h = classifyWallet(base({ txs: deposits }));
    const ex = h.find((x) => x.id === "exchange-related")!;
    expect(ex.basis).toBe("heuristic");
    expect(ex.explanation).toMatch(/not proof of ownership/);
  });

  it("dormant, holder, long-term holder and high-frequency", () => {
    const old = env(3000, { TransactionType: "Payment", Account: B, Destination: A, Amount: "1000000000" }, xrpPaymentMeta(B, A, "2000000000", "999999988", "1", "1000000001", "1000000000"), {
      time: "2025-01-01T00:00:00Z",
    });
    const r = classifyWallet(base({ balanceXrp: 5000, txs: [old], createdAtMs: Date.parse("2020-01-01T00:00:00Z") }));
    expect(ids(r)).toEqual(expect.arrayContaining(["dormant", "holder", "long-term-holder"]));
    expect(r.find((x) => x.id === "dormant")!.explanation).toMatch(/days ago/);

    const burst = Array.from({ length: 60 }, (_, i) => env(4000 + i, { TransactionType: "AccountSet", Account: A }, okMeta(), { time: new Date(NOW - i * 30_000).toISOString() }));
    expect(ids(classifyWallet(base({ txs: burst })))).toContain("high-frequency");
  });

  it("no labels for an empty, small wallet", () => {
    expect(classifyWallet(base())).toEqual([]);
  });
});

describe("wallet risk signals", () => {
  it("flags concentration, exchange exposure and large transfer (informational)", () => {
    const labels = indexLabels(parseWellKnown([{ account: B, name: "Kraken", desc: "1" }], isValidClassicAddress));
    const txs = Array.from({ length: 6 }, (_, i) =>
      env(5000 + i, { TransactionType: "Payment", Account: A, Destination: B, Amount: "2000000000000" }, xrpPaymentMeta(A, B, "9000000000000", "6999999999988", "1", "2000000000001", "2000000000000"), {
        time: new Date(NOW - i * 86_400_000).toISOString(),
      }),
    );
    const s = walletRiskSignals({ address: A, txs, balanceXrp: 10, labels, now: NOW });
    expect(s.map((x) => x.id).sort()).toEqual(["concentration", "exchange-exposure", "large-transfer"]);
    expect(s.every((x) => x.level === "info" || x.level === "notice")).toBe(true);
  });
});
