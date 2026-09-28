import { isExchangeLabel, primaryLabel, type LabelIndex } from "./labels";
import { counterparties, maxBurst } from "./wallet";
import type { TxEnvelope } from "./types";
import { deliveredAmount } from "./amount";

/**
 * Wallet risk signals (spec §187). Informational only — they describe observable patterns in the
 * fetched window, not wrongdoing, and never a recommendation.
 */
export interface RiskSignal {
  id: "concentration" | "exchange-exposure" | "large-transfer" | "dormancy" | "rapid-activity";
  title: string;
  detail: string;
  level: "info" | "notice";
}

export function walletRiskSignals(opts: {
  address: string;
  txs: TxEnvelope[];
  balanceXrp: number;
  labels: LabelIndex | null;
  largeXrp?: number;
  now?: number;
}): RiskSignal[] {
  const { address, txs, balanceXrp, labels } = opts;
  const largeXrp = opts.largeXrp ?? 1_000_000;
  const now = opts.now ?? Date.now();
  const n = txs.length;
  const out: RiskSignal[] = [];
  const cps = counterparties(txs, address);
  const totalVol = cps.reduce((s, c) => s + c.volumeXrp, 0);
  const payments = cps.reduce((s, c) => s + c.count, 0);

  if (payments >= 5 && totalVol > 0) {
    const top = [...cps].sort((a, b) => b.volumeXrp - a.volumeXrp)[0];
    const share = top.volumeXrp / totalVol;
    if (share >= 0.5)
      out.push({
        id: "concentration",
        title: "Counterparty concentration",
        detail: `${(share * 100).toFixed(0)}% of XRP payment volume in the last ${n} transactions involved a single counterparty (${top.address.slice(0, 8)}…).`,
        level: share >= 0.8 ? "notice" : "info",
      });
  }

  if (totalVol > 0 && labels) {
    const exVol = cps.filter((c) => isExchangeLabel(primaryLabel(labels, c.address))).reduce((s, c) => s + c.volumeXrp, 0);
    const share = exVol / totalVol;
    if (share >= 0.25)
      out.push({
        id: "exchange-exposure",
        title: "Exchange exposure",
        detail: `${(share * 100).toFixed(0)}% of XRP payment volume in the last ${n} transactions was with accounts labelled as exchanges (XRPScan well-known names).`,
        level: "info",
      });
  }

  let largest = 0;
  let largestHash = "";
  for (const e of txs) {
    if (e.tx.TransactionType !== "Payment" || e.meta?.TransactionResult !== "tesSUCCESS") continue;
    if (e.tx.Account !== address && e.tx.Destination !== address) continue;
    const { amount } = deliveredAmount(e.tx, e.meta);
    if (amount?.kind === "XRP" && amount.num > largest) {
      largest = amount.num;
      largestHash = e.hash;
    }
  }
  const relLarge = balanceXrp > 0 && largest >= balanceXrp * 0.5 && largest >= 10_000;
  if (largest >= largeXrp || relLarge)
    out.push({
      id: "large-transfer",
      title: "Large transfer",
      detail: `Largest XRP payment in the window: ${largest.toLocaleString("en-US", { maximumFractionDigits: 0 })} XRP (tx ${largestHash.slice(0, 8)}…). Large transfers have many explanations.`,
      level: "info",
    });

  const times = txs.map((e) => e.closeTimeMs).filter((t): t is number => t !== null);
  if (times.length) {
    const idle = (now - Math.max(...times)) / 86_400_000;
    if (idle >= 180)
      out.push({ id: "dormancy", title: "Dormancy", detail: `No transactions for ${Math.floor(idle)} days.`, level: "info" });
  }

  const burst = maxBurst(txs, 3_600_000);
  if (burst >= 50)
    out.push({ id: "rapid-activity", title: "Rapid activity", detail: `Up to ${burst} transactions within a single hour in the fetched window.`, level: "info" });

  return out;
}
