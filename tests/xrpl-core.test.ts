import { describe, expect, it } from "vitest";
import { classicAddressToXAddress, isValidClassicAddress } from "ripple-address-codec";
import { classifySearch, normalizeXrplAddress } from "@/lib/xrpl/address";
import { deliveredAmount, parseAmount, TF_PARTIAL_PAYMENT } from "@/lib/xrpl/amount";
import { createdAccounts, extractBalanceChanges, finalXrpBalanceFor, consumedOffers, summarizeAffectedNodes } from "@/lib/xrpl/meta";
import { decodeMemos, decodeTxFlags, explainResult, hexToUtf8, normalizeTxEnvelope, decodeDomain } from "@/lib/xrpl/tx";
import { classifyExchangeFlow, exchangeFlowTotals, filterWhales, toWhalePayment } from "@/lib/xrpl/whales";
import { indexLabels, parseWellKnown, userLabel } from "@/lib/xrpl/labels";
import { applyLedgerClosed, applyTx, emptyLedgerStat, sumActivity, typeBuckets } from "@/lib/xrpl/activity";
import { counterparties, paymentSummary, reconstructBalanceHistory, toTimelineItem, txPerDay, filterTimeline } from "@/lib/xrpl/wallet";
import { buildPaymentGraph, initialPositions, stepSimulation } from "@/lib/xrpl/graph";
import { looksLikeSecret } from "@/lib/portfolio/validation";
import { A, B, C, ISSUER, RLUSD, env, hash, okMeta, rippleSec, xrpPaymentMeta } from "./xrpl-fixtures";

describe("address normalization", () => {
  it("fixtures are valid classic addresses", () => {
    for (const a of [A, B, C, ISSUER]) expect(isValidClassicAddress(a)).toBe(true);
  });
  it("normalizes classic and X-addresses (with tag)", () => {
    expect(normalizeXrplAddress(`  ${A} `)).toEqual({ ok: true, classic: A });
    const x = classicAddressToXAddress(B, 12345, false);
    const n = normalizeXrplAddress(x);
    expect(n.ok && n.classic).toBe(B);
    expect(n.ok && n.tag).toBe(12345);
    expect(normalizeXrplAddress("rNotAnAddress").ok).toBe(false);
  });
  it("classifies search input", () => {
    expect(classifySearch(hash(7))).toBe("transaction");
    expect(classifySearch("90000000")).toBe("ledger");
    expect(classifySearch(A)).toBe("account");
    expect(classifySearch("hello")).toBe("unknown");
  });
  it("refuses secrets pasted as addresses", () => {
    expect(looksLikeSecret("sEdTM1uX8pu2do5XvTnutH6HsouMaM2")).toBe(true);
    expect(looksLikeSecret("abandon ".repeat(11) + "about")).toBe(true);
    expect(looksLikeSecret(A)).toBe(false);
  });
});

describe("envelope normalization (API v1 / v2)", () => {
  const meta = xrpPaymentMeta(A, B, "2000000000", "999999988", "50000000", "1050000000", "1000000000");
  it("v1 stream message with `transaction`", () => {
    const e = normalizeTxEnvelope({
      type: "transaction",
      validated: true,
      ledger_index: 95000000,
      meta,
      transaction: { TransactionType: "Payment", Account: A, Destination: B, Amount: "1000000000", Fee: "12", Sequence: 10, hash: hash(1).toLowerCase(), date: rippleSec("2026-09-01T00:00:00Z") },
    });
    expect(e).not.toBeNull();
    expect(e!.hash).toBe(hash(1));
    expect(e!.ledgerIndex).toBe(95000000);
    expect(e!.closeTimeMs).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(e!.validated).toBe(true);
  });
  it("v2 stream message with `tx_json` + DeliverMax + close_time_iso", () => {
    const e = normalizeTxEnvelope({
      type: "transaction",
      validated: true,
      ledger_index: 95000001,
      hash: hash(2),
      close_time_iso: "2026-09-02T10:00:00Z",
      meta,
      tx_json: { TransactionType: "Payment", Account: A, Destination: B, DeliverMax: "1000000000", Fee: "12", Sequence: 10 },
    });
    expect(e!.hash).toBe(hash(2));
    expect(e!.closeTimeMs).toBe(Date.parse("2026-09-02T10:00:00Z"));
    expect(deliveredAmount(e!.tx, e!.meta).amount?.num).toBe(1000);
  });
  it("ledger expand v1 uses metaData", () => {
    const e = normalizeTxEnvelope({ TransactionType: "OfferCancel", Account: A, Fee: "10", Sequence: 3, hash: hash(3), metaData: okMeta() });
    expect(e!.meta?.TransactionResult).toBe("tesSUCCESS");
    expect(e!.tx).not.toHaveProperty("metaData");
  });
  it("rejects garbage", () => {
    expect(normalizeTxEnvelope({ foo: 1 })).toBeNull();
    expect(normalizeTxEnvelope({ tx_json: { TransactionType: "Payment", Account: A }, hash: "xyz" })).toBeNull();
  });
});

describe("delivered_amount handling", () => {
  it("uses meta.delivered_amount for partial payments, never Amount", () => {
    const e = env(
      10,
      { TransactionType: "Payment", Account: A, Destination: B, Amount: "1000000000000", Flags: TF_PARTIAL_PAYMENT },
      { ...xrpPaymentMeta(A, B, "5000000", "3999988", "1000000", "2000000", "1000000") },
    );
    const d = deliveredAmount(e.tx, e.meta);
    expect(d.source).toBe("meta.delivered_amount");
    expect(d.amount?.num).toBe(1);
    // whale filter must not see 1,000,000 XRP here
    expect(toWhalePayment(e, 100_000)).toBeNull();
  });
  it("partial payment without delivered_amount → unavailable (not Amount)", () => {
    const e = env(11, { TransactionType: "Payment", Account: A, Destination: B, Amount: "1000000000000", Flags: TF_PARTIAL_PAYMENT }, okMeta());
    expect(deliveredAmount(e.tx, e.meta)).toEqual({ amount: null, source: "unavailable" });
  });
  it("delivered_amount 'unavailable' (old ledgers) is respected", () => {
    const e = env(12, { TransactionType: "Payment", Account: A, Destination: B, Amount: "5000000" }, okMeta({ delivered_amount: "unavailable" }));
    expect(deliveredAmount(e.tx, e.meta).amount).toBeNull();
  });
  it("failed payments deliver nothing", () => {
    const e = env(13, { TransactionType: "Payment", Account: A, Destination: B, Amount: "5000000" }, { TransactionResult: "tecPATH_DRY", AffectedNodes: [] });
    expect(deliveredAmount(e.tx, e.meta).amount).toBeNull();
  });
  it("parses IOU and XRP amounts exactly", () => {
    expect(parseAmount("1")?.value).toBe("0.000001");
    const iou = parseAmount({ currency: RLUSD, issuer: ISSUER, value: "12.5" });
    expect(iou?.currency).toBe("RLUSD");
    expect(iou?.kind).toBe("IOU");
  });
});

describe("balance changes from meta", () => {
  it("extracts XRP deltas incl. fee and created accounts", () => {
    const meta = xrpPaymentMeta(A, B, "2000000000", "999999988", null, "1000000000", "1000000000");
    const ch = extractBalanceChanges(meta);
    expect(ch).toContainEqual({ account: A, currency: "XRP", value: "-1000.000012" });
    expect(ch).toContainEqual({ account: B, currency: "XRP", value: "1000" });
    expect(createdAccounts(meta)).toEqual([B]);
    expect(finalXrpBalanceFor(meta, A)?.toString()).toBe("999.999988");
  });
  it("RippleState: low account +Δ, high account −Δ", () => {
    const meta = okMeta({
      AffectedNodes: [
        {
          ModifiedNode: {
            LedgerEntryType: "RippleState",
            LedgerIndex: "CC",
            FinalFields: {
              Balance: { currency: RLUSD, issuer: "rrrrrrrrrrrrrrrrrrrrBZbvji", value: "-150" },
              LowLimit: { currency: RLUSD, issuer: ISSUER, value: "0" },
              HighLimit: { currency: RLUSD, issuer: B, value: "1000000" },
            },
            PreviousFields: { Balance: { currency: RLUSD, issuer: "rrrrrrrrrrrrrrrrrrrrBZbvji", value: "-100" } },
          },
        },
      ],
    });
    const ch = extractBalanceChanges(meta);
    // Low = issuer (balance negative from low perspective = high holds tokens). High gains 50.
    expect(ch).toContainEqual({ account: ISSUER, currency: "RLUSD", currencyCode: RLUSD, issuer: B, value: "-50" });
    expect(ch).toContainEqual({ account: B, currency: "RLUSD", currencyCode: RLUSD, issuer: ISSUER, value: "50" });
    expect(summarizeAffectedNodes(meta)[0].title).toBe("Trust line RLUSD");
  });
  it("counts consumed offers (not the taker's own)", () => {
    const meta = okMeta({
      AffectedNodes: [
        { ModifiedNode: { LedgerEntryType: "Offer", LedgerIndex: "O1", FinalFields: { Account: B, TakerPays: "10" }, PreviousFields: { TakerPays: "20" } } },
        { DeletedNode: { LedgerEntryType: "Offer", LedgerIndex: "O2", FinalFields: { Account: C, TakerPays: "0" }, PreviousFields: { TakerPays: "5" } } },
        { DeletedNode: { LedgerEntryType: "Offer", LedgerIndex: "O3", FinalFields: { Account: A } } },
      ],
    });
    expect(consumedOffers(meta, A)).toBe(2);
  });
});

describe("tx helpers", () => {
  it("explains result classes", () => {
    expect(explainResult("tesSUCCESS").cls).toBe("success");
    expect(explainResult("tecPATH_DRY").cls).toBe("failed-fee-claimed");
    expect(explainResult("temMALFORMED").cls).toBe("not-applied");
  });
  it("decodes flags incl. unknown bits", () => {
    expect(decodeTxFlags("Payment", 0x00020000 | 0x80000000).names.sort()).toEqual(["tfFullyCanonicalSig", "tfPartialPayment"]);
    expect(decodeTxFlags("OfferCreate", 0x00080000 | 0x1).unknown).toBe("0x00000001");
  });
  it("decodes printable memos, keeps binary as hex", () => {
    const tx = { TransactionType: "Payment", Account: A, Memos: [{ Memo: { MemoType: "746578742F706C61696E", MemoData: "48656C6C6F20E282AC" } }, { Memo: { MemoData: "00FF01" } }] };
    const m = decodeMemos(tx);
    expect(m[0]).toMatchObject({ type: "text/plain", data: "Hello €", printable: true });
    expect(m[1]).toMatchObject({ data: null, dataHex: "00FF01", printable: false });
    expect(hexToUtf8("ZZ").printable).toBe(false);
    expect(decodeDomain("726970706C652E636F6D")).toBe("ripple.com");
  });
});

describe("whale filter & exchange flows", () => {
  const big = env(20, { TransactionType: "Payment", Account: A, Destination: B, Amount: "2000000000000" }, xrpPaymentMeta(A, B, "3000000000000", "999999999988", "0", "2000000000000", "2000000000000"));
  const mid = env(21, { TransactionType: "Payment", Account: B, Destination: C, Amount: "600000000000" }, xrpPaymentMeta(B, C, "2000000000000", "1399999999988", "0", "600000000000", "600000000000"));
  const token = env(22, { TransactionType: "Payment", Account: A, Destination: B, Amount: { currency: RLUSD, issuer: ISSUER, value: "5000000" } }, okMeta({ delivered_amount: { currency: RLUSD, issuer: ISSUER, value: "5000000" } }));
  it("keeps only XRP payments with delivered ≥ threshold", () => {
    const ws = [big, mid, token].map((e) => toWhalePayment(e, 100_000)).filter((w) => w !== null);
    expect(ws.map((w) => w!.amountXrp)).toEqual([2_000_000, 600_000]);
    expect(filterWhales(ws as NonNullable<(typeof ws)[number]>[], 1_000_000)).toHaveLength(1);
  });
  it("classifies flows only when a side has an exchange label with provenance", () => {
    const wk = parseWellKnown(
      [
        { account: B, name: "Binance", desc: "1", domain: "binance.com", verified: true },
        { account: C, name: "Some Wallet", desc: "", verified: false },
        { account: "bad", name: "x" },
      ],
      isValidClassicAddress,
    );
    expect(wk).toHaveLength(2);
    expect(wk[0].category).toBe("EXCHANGE");
    expect(wk[0].provenance).toMatch(/XRPScan/);
    const idx = indexLabels(wk, [userLabel(A, "My exchange", "EXCHANGE")]);
    expect(classifyExchangeFlow({ from: A, to: B }, idx)?.kind).toBe("inflow");
    expect(classifyExchangeFlow({ from: B, to: C }, idx)?.kind).toBe("outflow");
    // user-provided EXCHANGE labels never drive flow classification (A is only user-labelled)
    expect(classifyExchangeFlow({ from: A, to: C }, idx)).toBeNull();
    expect(classifyExchangeFlow({ from: C, to: C }, idx)).toBeNull();
    const t = exchangeFlowTotals(
      [toWhalePayment(big, 1)!, toWhalePayment(mid, 1)!],
      idx,
    );
    expect(t.inflowXrp).toBe(2_000_000);
    expect(t.outflowXrp).toBe(600_000);
    expect(t.netXrp).toBe(1_400_000);
  });
});

describe("network activity aggregation", () => {
  it("aggregates per ledger from stream data", () => {
    const s = emptyLedgerStat(95000000);
    applyTx(s, env(30, { TransactionType: "Payment", Account: A, Destination: B, Amount: "1000000000" }, xrpPaymentMeta(A, B, "2000000000", "999999988", null, "1000000000", "1000000000")));
    applyTx(s, env(31, { TransactionType: "OfferCreate", Account: B, TakerGets: "10", TakerPays: { currency: "USD", issuer: ISSUER, value: "1" } }, okMeta()));
    applyTx(s, env(32, { TransactionType: "AMMDeposit", Account: B }, { TransactionResult: "tecAMM_FAILED", AffectedNodes: [] }));
    applyTx(s, env(33, { TransactionType: "Payment", Account: A, Destination: B, Amount: { currency: RLUSD, issuer: ISSUER, value: "25" } }, okMeta({ delivered_amount: { currency: RLUSD, issuer: ISSUER, value: "25" } })));
    applyLedgerClosed(s, { type: "ledgerClosed", ledger_index: 95000000, ledger_time: rippleSec("2026-09-01T00:00:00Z"), txn_count: 4, fee_base: 10, reserve_base: 1000000, reserve_inc: 200000 });
    expect(s.observedTx).toBe(4);
    expect(s.txnCount).toBe(4);
    expect(s.newAccounts).toBe(1);
    expect(s.xrpPaymentVolume).toBe(1000);
    expect(s.offerCreates).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.ammTx).toBe(0); // failed tx not counted as activity type bucket beyond types
    expect(s.rlusdPayments).toBe(1);
    expect(s.feesDrops).toBe(48);
    const t = sumActivity([s]);
    expect(t.feesXrp).toBe(0.000048);
    expect(t.activeAccounts).toBe(2);
    expect(typeBuckets(t.types).find((b) => b.type === "AMM*")?.count).toBe(1);
  });
});

describe("wallet analytics from fetched window", () => {
  const e1 = env(40, { TransactionType: "Payment", Account: B, Destination: A, Amount: "500000000" }, xrpPaymentMeta(B, A, "900000000", "399999988", "100000000", "600000000", "500000000"), { time: "2026-09-01T00:00:00Z", ledger: 100 });
  const e2 = env(41, { TransactionType: "Payment", Account: A, Destination: C, Amount: "200000000", DestinationTag: 7 }, xrpPaymentMeta(A, C, "600000000", "399999988", "0", "200000000", "200000000"), { time: "2026-09-03T00:00:00Z", ledger: 200 });
  const e3 = env(42, { TransactionType: "OfferCreate", Account: A, TakerGets: "1000", TakerPays: { currency: "USD", issuer: ISSUER, value: "1" } }, okMeta({ AffectedNodes: [{ ModifiedNode: { LedgerEntryType: "AccountRoot", LedgerIndex: "X", FinalFields: { Account: A, Balance: "399999976" }, PreviousFields: { Balance: "399999988" } } }] }), { time: "2026-09-03T05:00:00Z", ledger: 300 });
  const all = [e3, e1, e2];

  it("timeline items with direction, categories & filters", () => {
    const items = all.map((e) => toTimelineItem(e, A, 100));
    const out = items.find((i) => i.hash === e2.hash)!;
    expect(out.direction).toBe("out");
    expect(out.counterparty).toBe(C);
    expect(out.categories).toContain("large");
    expect(filterTimeline(items, "offer")).toHaveLength(1);
    expect(filterTimeline(items, "token")).toHaveLength(1);
    expect(filterTimeline(items, "payment")).toHaveLength(2);
  });
  it("counterparties & payment summary", () => {
    const cps = counterparties(all, A);
    expect(cps.map((c) => c.address).sort()).toEqual([B, C].sort());
    const s = paymentSummary(all, A);
    expect(s).toMatchObject({ inCount: 1, outCount: 1, inXrp: 500, outXrp: 200, netXrp: 300 });
    expect(s.feesPaidXrp).toBeCloseTo(0.000024, 9);
  });
  it("tx per day fills idle days", () => {
    expect(txPerDay(all)).toEqual([
      { day: "2026-09-01", count: 1 },
      { day: "2026-09-02", count: 0 },
      { day: "2026-09-03", count: 2 },
    ]);
  });
  it("reconstructs XRP balance walking back from the current balance", () => {
    const r = reconstructBalanceHistory(all, A, "399.999976");
    expect(r.points.map((p) => p.balance)).toEqual([600, 399.999988, 399.999976]);
    expect(r.startBalance).toBe(100);
    // even with a wrong current balance, meta FinalFields re-anchor the walk
    const r2 = reconstructBalanceHistory(all, A, "1");
    expect(r2.points.map((p) => p.balance)).toEqual([600, 399.999988, 399.999976]);
  });
});

describe("entity graph", () => {
  it("aggregates observed payment edges and filters by amount", () => {
    const e1 = env(50, { TransactionType: "Payment", Account: A, Destination: B, Amount: "5000000" }, xrpPaymentMeta(A, B, "10000000", "4999988", "1", "5000001", "5000000"));
    const e2 = env(51, { TransactionType: "Payment", Account: A, Destination: B, Amount: "7000000" }, xrpPaymentMeta(A, B, "10000000", "2999988", "1", "7000001", "7000000"));
    const e3 = env(52, { TransactionType: "Payment", Account: C, Destination: A, Amount: "1000000" }, xrpPaymentMeta(C, A, "10000000", "8999988", "1", "1000001", "1000000"));
    const g = buildPaymentGraph([A], [e1, e2, e3, e1]);
    expect(g.nodes).toHaveLength(3);
    const ab = g.edges.find((x) => x.source === A && x.target === B)!;
    expect(ab.count).toBe(2);
    expect(ab.xrp).toBe(12);
    expect(buildPaymentGraph([A], [e1, e2, e3], { minXrp: 6 }).edges).toHaveLength(1);
    const pos = initialPositions(g.nodes.map((n) => n.id));
    let energy = Infinity;
    for (let i = 0; i < 300; i++) energy = stepSimulation(pos, g.edges);
    expect(Number.isFinite(energy)).toBe(true);
    expect(energy).toBeLessThan(1);
  });
});
