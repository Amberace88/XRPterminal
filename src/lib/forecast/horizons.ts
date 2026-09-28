/**
 * Horizon gating rule (spec §55: "Only enable horizons where methodology/data quality is sufficient").
 *
 * Documented rule — based on the number of INDEPENDENT (non-overlapping) observations,
 * because overlapping H-day windows are highly autocorrelated and overstate the sample size:
 *
 *   independentWindows      Nᵢ = ⌊(days of history − 1) / H⌋
 *   walk-forward windows    Nᵥ = ⌊(days of history − minTrain − H) / H⌋   (independent evaluation outcomes)
 *
 *   ENABLED     Nᵢ ≥ 30 and Nᵥ ≥ 20
 *   LOW SAMPLE  Nᵢ ≥ 8  and Nᵥ ≥ 4     (shown, clearly flagged, wide error bars on metrics)
 *   DISABLED    otherwise              (not computed; explanation shown)
 *
 * With ≈3,500 days of XRP/USD history (2017→) this yields: 7D/30D/90D enabled, 180D/1Y low-sample,
 * 3Y/5Y disabled (only 3 and 1 independent windows exist — too few to say anything about the tails).
 */
import type { HorizonKey, HorizonStatus, HorizonStatusKind } from "./types";

export const HORIZONS: { key: HorizonKey; days: number; label: string }[] = [
  { key: "7D", days: 7, label: "7 days" },
  { key: "30D", days: 30, label: "30 days" },
  { key: "90D", days: 90, label: "90 days" },
  { key: "180D", days: 180, label: "180 days" },
  { key: "1Y", days: 365, label: "1 year" },
  { key: "3Y", days: 1095, label: "3 years" },
  { key: "5Y", days: 1825, label: "5 years" },
];

export const GATING_RULE = {
  enabledMinIndependent: 30,
  enabledMinWalkForward: 20,
  lowSampleMinIndependent: 8,
  lowSampleMinWalkForward: 4,
  minTrainDays: 365,
} as const;

export const GATING_RULE_TEXT =
  "A horizon is enabled when the history contains ≥30 non-overlapping windows of that length and the walk-forward test has ≥20 independent outcomes; it is shown as LOW SAMPLE with ≥8 windows and ≥4 outcomes; otherwise it is disabled.";

export function horizonByKey(key: string): { key: HorizonKey; days: number; label: string } | undefined {
  return HORIZONS.find((h) => h.key === key);
}

export function horizonByDays(days: number): { key: HorizonKey; days: number; label: string } | undefined {
  return HORIZONS.find((h) => h.days === days);
}

/** Apply the gating rule. `historyDays` = number of daily candles available. */
export function horizonStatus(historyDays: number, days: number, key?: HorizonKey): HorizonStatus {
  const k = key ?? horizonByDays(days)?.key ?? "30D";
  const ni = Math.max(0, Math.floor((historyDays - 1) / days));
  const nv = Math.max(0, Math.floor((historyDays - GATING_RULE.minTrainDays - days) / days));
  let status: HorizonStatusKind;
  let reason: string;
  if (ni >= GATING_RULE.enabledMinIndependent && nv >= GATING_RULE.enabledMinWalkForward) {
    status = "enabled";
    reason = `${ni} non-overlapping ${days}-day windows in the history and ~${nv} independent walk-forward outcomes — sufficient for the rule (≥30 / ≥20).`;
  } else if (ni >= GATING_RULE.lowSampleMinIndependent && nv >= GATING_RULE.lowSampleMinWalkForward) {
    status = "low_sample";
    reason = `Only ${ni} non-overlapping ${days}-day windows and ~${nv} independent walk-forward outcomes exist. Ranges are shown but calibration evidence is thin — treat tails with extra caution.`;
  } else {
    status = "disabled";
    reason = `Only ${ni} non-overlapping ${days}-day window${ni === 1 ? "" : "s"} exist in the available history (need ≥8, plus ≥4 walk-forward outcomes). There is not enough independent history to estimate or validate a ${days}-day range honestly.`;
  }
  return { key: k, days, status, independentWindows: ni, walkForwardIndependent: nv, reason };
}

export function allHorizonStatuses(historyDays: number): HorizonStatus[] {
  return HORIZONS.map((h) => horizonStatus(historyDays, h.days, h.key));
}
