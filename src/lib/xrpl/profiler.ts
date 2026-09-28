import { isLpTokenCode } from "./amount";
import type { WalletLabel } from "./labels";
import { maxBurst, paymentSummary } from "./wallet";
import type { TrustLine, TxEnvelope } from "./types";

/**
 * Rule-based wallet profiler (spec §29). Each classification is deterministic, data-driven and
 * carries an explanation sentence. No label is derived from balance alone except "whale", which
 * explicitly states that balance says nothing about skill or intent. "Smart money" is never produced.
 */

export type ProfileLabelId =
  | "holder"
  | "active-trader"
  | "liquidity-participant"
  | "issuer"
  | "exchange-related"
  | "whale"
  | "long-term-holder"
  | "high-frequency"
  | "dormant";

export const PROFILE_LABEL_NAMES: Record<ProfileLabelId, string> = {
  holder: "Holder",
  "active-trader": "Active trader",
  "liquidity-participant": "Liquidity participant",
  issuer: "Issuer",
  "exchange-related": "Exchange-related",
  whale: "Whale",
  "long-term-holder": "Long-term holder",
  "high-frequency": "High-frequency activity",
  dormant: "Dormant",
};

export const PROFILE_RULES = {
  whaleXrp: 1_000_000,
  holderMinXrp: 500,
  holderMaxOfferShare: 0.2,
  traderMinOffers: 20,
  traderMinDays: 3,
  hfPerHour: 50,
  hfPerDay: 200,
  dormantDays: 180,
  longTermDays: 365,
  exchangeMinTaggedDeposits: 20,
  exchangeMinDistinctTags: 10,
  exchangeMinDistinctSenders: 10,
} as const;

export interface ProfileInput {
  address: string;
  balanceXrp: number;
  /** Fetched transaction window (any order) */
  txs: TxEnvelope[];
  /** true if the window is the complete history (no more pages) */
  completeHistory: boolean;
  lines: TrustLine[];
  accountFlags: string[];
  hasAmmId: boolean;
  /** Account creation time if known */
  createdAtMs: number | null;
  externalLabels: WalletLabel[];
  now?: number;
}

export interface ProfileLabel {
  id: ProfileLabelId;
  name: string;
  explanation: string;
  evidence: Record<string, string | number>;
  basis: "rule-based" | "external-label" | "heuristic";
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const DAY = 86_400_000;

export function classifyWallet(input: ProfileInput): ProfileLabel[] {
  const now = input.now ?? Date.now();
  const R = PROFILE_RULES;
  const out: ProfileLabel[] = [];
  const n = input.txs.length;
  const windowText = input.completeHistory ? `across the account's full history (${n} transactions)` : `within the last ${n} fetched transactions`;
  const byType = (t: string) => input.txs.filter((e) => e.tx.TransactionType === t && e.tx.Account === input.address);
  const days = (list: TxEnvelope[]) => new Set(list.map((e) => (e.closeTimeMs ? new Date(e.closeTimeMs).toISOString().slice(0, 10) : "?"))).size;
  const times = input.txs.map((e) => e.closeTimeMs).filter((t): t is number => t !== null);
  const lastTx = times.length ? Math.max(...times) : null;
  const firstTx = times.length ? Math.min(...times) : null;

  // Whale — balance only, with explicit caveat
  if (input.balanceXrp >= R.whaleXrp) {
    out.push({
      id: "whale",
      name: PROFILE_LABEL_NAMES.whale,
      explanation: `Classified as whale because the current balance (${fmt(input.balanceXrp)} XRP) is at least ${fmt(R.whaleXrp)} XRP. Balance alone says nothing about skill, intent or ownership.`,
      evidence: { balanceXrp: input.balanceXrp, thresholdXrp: R.whaleXrp },
      basis: "rule-based",
    });
  }

  // Active trader
  const offers = byType("OfferCreate");
  const offerDays = days(offers);
  if (offers.length >= R.traderMinOffers && offerDays >= R.traderMinDays) {
    out.push({
      id: "active-trader",
      name: PROFILE_LABEL_NAMES["active-trader"],
      explanation: `Classified as active trader because of ${offers.length} OfferCreate transactions across ${offerDays} days ${windowText}.`,
      evidence: { offerCreates: offers.length, days: offerDays },
      basis: "rule-based",
    });
  }

  // Liquidity participant
  const amm = input.txs.filter((e) => e.tx.Account === input.address && e.tx.TransactionType.startsWith("AMM") && e.meta?.TransactionResult === "tesSUCCESS");
  const lpLines = input.lines.filter((l) => isLpTokenCode(l.currency) && Number(l.balance) > 0);
  const isAmmAccount = input.hasAmmId || input.accountFlags.includes("lsfAMM");
  if (isAmmAccount) {
    out.push({
      id: "liquidity-participant",
      name: PROFILE_LABEL_NAMES["liquidity-participant"],
      explanation: "Classified as liquidity participant because this is an AMM pool account (AccountRoot has an AMMID) — it is controlled by the protocol, not a person.",
      evidence: { ammAccount: "yes" },
      basis: "rule-based",
    });
  } else if (amm.length > 0 || lpLines.length > 0) {
    out.push({
      id: "liquidity-participant",
      name: PROFILE_LABEL_NAMES["liquidity-participant"],
      explanation: `Classified as liquidity participant because of ${amm.length} successful AMM transactions ${windowText} and ${lpLines.length} LP-token trust line(s) with a positive balance.`,
      evidence: { ammTx: amm.length, lpTokenLines: lpLines.length },
      basis: "rule-based",
    });
  }

  // Issuer: trust lines where this account's balance is negative = others hold tokens it issued
  const issued = input.lines.filter((l) => Number(l.balance) < 0);
  if (issued.length > 0) {
    const codes = [...new Set(issued.map((l) => l.currency))].slice(0, 3);
    out.push({
      id: "issuer",
      name: PROFILE_LABEL_NAMES.issuer,
      explanation: `Classified as issuer because ${issued.length} fetched trust line(s) hold tokens issued by this account (currency codes: ${codes.join(", ")}).`,
      evidence: { holdersInFetchedLines: issued.length },
      basis: "rule-based",
    });
  }

  // Exchange-related: external label first, heuristic second
  const exLabel = input.externalLabels.find((l) => l.category === "EXCHANGE" && l.source === "xrpscan-well-known");
  if (exLabel) {
    out.push({
      id: "exchange-related",
      name: PROFILE_LABEL_NAMES["exchange-related"],
      explanation: `Classified as exchange-related because XRPScan's well-known list names this account "${exLabel.name}".`,
      evidence: { label: exLabel.name, source: "XRPScan well-known names" },
      basis: "external-label",
    });
  } else {
    const tagged = input.txs.filter(
      (e) => e.tx.TransactionType === "Payment" && e.tx.Destination === input.address && e.tx.Account !== input.address && typeof e.tx.DestinationTag === "number" && e.meta?.TransactionResult === "tesSUCCESS",
    );
    const tags = new Set(tagged.map((e) => e.tx.DestinationTag));
    const senders = new Set(tagged.map((e) => e.tx.Account));
    if (tagged.length >= R.exchangeMinTaggedDeposits && tags.size >= R.exchangeMinDistinctTags && senders.size >= R.exchangeMinDistinctSenders) {
      out.push({
        id: "exchange-related",
        name: PROFILE_LABEL_NAMES["exchange-related"],
        explanation: `Heuristic: ${tagged.length} incoming payments used ${tags.size} distinct destination tags from ${senders.size} senders ${windowText} — a pattern typical of custodial deposit accounts. This is not proof of ownership.`,
        evidence: { taggedDeposits: tagged.length, distinctTags: tags.size, distinctSenders: senders.size },
        basis: "heuristic",
      });
    }
  }

  // High-frequency activity
  const burst = maxBurst(input.txs, 3_600_000);
  const spanDays = firstTx && lastTx ? Math.max(1, (lastTx - firstTx) / DAY) : null;
  const perDay = spanDays ? n / spanDays : 0;
  if (burst >= R.hfPerHour || (n >= 100 && perDay >= R.hfPerDay)) {
    out.push({
      id: "high-frequency",
      name: PROFILE_LABEL_NAMES["high-frequency"],
      explanation: `Classified as high-frequency activity because up to ${burst} transactions occurred within one hour (≈${fmt(perDay)} per day on average) ${windowText}.`,
      evidence: { maxPerHour: burst, avgPerDay: Math.round(perDay) },
      basis: "rule-based",
    });
  }

  // Dormant
  const idleDays = lastTx ? (now - lastTx) / DAY : null;
  if (idleDays !== null && idleDays >= R.dormantDays) {
    out.push({
      id: "dormant",
      name: PROFILE_LABEL_NAMES.dormant,
      explanation: `Classified as dormant because the most recent transaction was ${Math.floor(idleDays)} days ago (threshold ${R.dormantDays} days).`,
      evidence: { daysSinceLastTx: Math.floor(idleDays) },
      basis: "rule-based",
    });
  }

  // Holder
  const ownOffers = offers.length;
  const offerShare = n ? ownOffers / n : 0;
  if (input.balanceXrp >= R.holderMinXrp && offerShare < R.holderMaxOfferShare) {
    out.push({
      id: "holder",
      name: PROFILE_LABEL_NAMES.holder,
      explanation: `Classified as holder because it holds ${fmt(input.balanceXrp)} XRP and DEX offers make up ${(offerShare * 100).toFixed(0)}% of transactions ${windowText}.`,
      evidence: { balanceXrp: input.balanceXrp, offerShare: Number(offerShare.toFixed(3)) },
      basis: "rule-based",
    });
  }

  // Long-term holder: account old enough, balance above min, and no outgoing XRP payments for ≥ 180 days
  const ageDays = input.createdAtMs ? (now - input.createdAtMs) / DAY : null;
  if (ageDays !== null && ageDays >= R.longTermDays && input.balanceXrp >= R.holderMinXrp) {
    const outs = input.txs
      .filter((e) => e.tx.TransactionType === "Payment" && e.tx.Account === input.address && e.meta?.TransactionResult === "tesSUCCESS")
      .map((e) => e.closeTimeMs ?? 0);
    const lastOut = outs.length ? Math.max(...outs) : null;
    const windowCoversDays = firstTx ? (now - firstTx) / DAY : 0;
    const quietDays = lastOut ? (now - lastOut) / DAY : null;
    const ok = quietDays !== null ? quietDays >= R.dormantDays : input.completeHistory || windowCoversDays >= R.dormantDays;
    if (ok) {
      const ps = paymentSummary(input.txs, input.address);
      out.push({
        id: "long-term-holder",
        name: PROFILE_LABEL_NAMES["long-term-holder"],
        explanation:
          quietDays !== null
            ? `Classified as long-term holder because the account is ${Math.floor(ageDays)} days old, holds ${fmt(input.balanceXrp)} XRP, and its last outgoing payment was ${Math.floor(quietDays)} days ago.`
            : `Classified as long-term holder because the account is ${Math.floor(ageDays)} days old, holds ${fmt(input.balanceXrp)} XRP, and made no outgoing payments ${windowText} (${ps.inCount} incoming).`,
        evidence: { accountAgeDays: Math.floor(ageDays), daysSinceLastOutgoing: quietDays === null ? "none in window" : Math.floor(quietDays) },
        basis: "rule-based",
      });
    }
  }

  return out;
}
