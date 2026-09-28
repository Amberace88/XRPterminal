/**
 * Position sizing calculator (spec §105). Pure & deterministic; excludes fees and slippage.
 */
import { D, qtyRound } from "./decimal";

export interface SizingResult {
  qty: number;
  notional: number;
  riskAmount: number;
  potentialProfit: number | null;
  rewardRisk: number | null;
  positionPct: number;
}

/** Position sizing (spec §105): size = (account × risk%) ÷ (entry − stop). Long positions. */
export function positionSize(account: number, riskPct: number, entry: number, stop: number, target: number | null): SizingResult | null {
  if (!(account > 0) || !(riskPct > 0) || !(entry > 0) || !(stop > 0) || stop >= entry) return null;
  const riskBudget = D(account).times(riskPct).div(100);
  const qty = qtyRound(riskBudget.div(D(entry).minus(stop))).toNumber();
  const potentialProfit = target && target > entry ? (target - entry) * qty : null;
  return {
    qty,
    notional: qty * entry,
    riskAmount: qty * (entry - stop),
    potentialProfit,
    rewardRisk: potentialProfit !== null ? (target! - entry) / (entry - stop) : null,
    positionPct: (qty * entry * 100) / account,
  };
}
