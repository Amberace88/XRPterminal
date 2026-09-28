/**
 * "What changed" (spec §62): compare the current forecast with the previous one and explain the
 * differences in plain language — generated deterministically from the numbers, never by AI.
 */
import { formatPct, formatPrice } from "@/lib/format";
import type { ForecastInputs, ForecastOutput, ForecastUncertainty, Quantiles } from "./types";

/** Minimal comparable view of a forecast (a live ForecastOutput or a published DB row). */
export interface ForecastSnapshot {
  asOfDate: string;
  modelName: string;
  modelVersion: string;
  horizonDays: number;
  quantiles: Quantiles;
  inputs: ForecastInputs;
  uncertainty: Pick<ForecastUncertainty, "bandWidth50Pct" | "bandWidth90Pct" | "returnSampleSize">;
  source: "published" | "computed";
}

export function snapshotOf(f: ForecastOutput, source: ForecastSnapshot["source"] = "computed"): ForecastSnapshot {
  return {
    asOfDate: f.asOfDate,
    modelName: f.modelName,
    modelVersion: f.modelVersion,
    horizonDays: f.horizonDays,
    quantiles: f.quantiles,
    inputs: f.inputs,
    uncertainty: { bandWidth50Pct: f.uncertainty.bandWidth50Pct, bandWidth90Pct: f.uncertainty.bandWidth90Pct, returnSampleSize: f.uncertainty.returnSampleSize },
    source,
  };
}

export type ChangeKind = "range" | "uncertainty" | "regime" | "inputs" | "model_version";

export interface ChangeItem {
  kind: ChangeKind;
  title: string;
  changed: boolean;
  before: string;
  after: string;
  explanation: string;
}

export interface WhatChanged {
  current: { asOfDate: string; modelVersion: string };
  previous: { asOfDate: string; modelVersion: string; source: ForecastSnapshot["source"] };
  items: ChangeItem[];
  summary: string;
}

const rel = (a: number, b: number) => (b / a - 1) * 100;
const px = (v: number) => formatPrice(v, "USD");
const volPct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(0)}%`);

/** Materiality thresholds (documented): range bounds ±3%, band width ±2 pp, vol ±5 pp, corr ±0.10. */
export const CHANGE_THRESHOLDS = { rangePct: 3, widthPp: 2, volPp: 5, corr: 0.1, anchorPct: 3 } as const;

export function compareForecasts(prev: ForecastSnapshot, cur: ForecastSnapshot): WhatChanged {
  const items: ChangeItem[] = [];
  const pq = prev.quantiles;
  const cq = cur.quantiles;

  // Range (BASE band + median)
  const loChg = rel(pq.p25, cq.p25);
  const hiChg = rel(pq.p75, cq.p75);
  const anchorChg = rel(prev.inputs.anchorPrice, cur.inputs.anchorPrice);
  const rangeChanged = Math.abs(loChg) >= CHANGE_THRESHOLDS.rangePct || Math.abs(hiChg) >= CHANGE_THRESHOLDS.rangePct;
  const rangeWhy =
    Math.abs(anchorChg) >= CHANGE_THRESHOLDS.anchorPct
      ? `Mostly because the anchor price moved ${formatPct(anchorChg, 1)} (${px(prev.inputs.anchorPrice)} → ${px(cur.inputs.anchorPrice)}); the model re-centres on the latest close.`
      : "The anchor price is similar, so the shift comes from the volatility scale and the updated return sample.";
  items.push({
    kind: "range",
    title: "BASE range (P25–P75)",
    changed: rangeChanged,
    before: `${px(pq.p25)} – ${px(pq.p75)}`,
    after: `${px(cq.p25)} – ${px(cq.p75)}`,
    explanation: rangeChanged
      ? `Lower bound ${formatPct(loChg, 1)}, upper bound ${formatPct(hiChg, 1)}. ${rangeWhy}`
      : `Both bounds moved less than ${CHANGE_THRESHOLDS.rangePct}% (${formatPct(loChg, 1)} / ${formatPct(hiChg, 1)}).`,
  });

  // Uncertainty
  const w50 = cur.uncertainty.bandWidth50Pct - prev.uncertainty.bandWidth50Pct;
  const w90 = cur.uncertainty.bandWidth90Pct - prev.uncertainty.bandWidth90Pct;
  const uncChanged = Math.abs(w90) >= CHANGE_THRESHOLDS.widthPp || Math.abs(w50) >= CHANGE_THRESHOLDS.widthPp;
  items.push({
    kind: "uncertainty",
    title: "Uncertainty (band width)",
    changed: uncChanged,
    before: `50%: ${prev.uncertainty.bandWidth50Pct.toFixed(1)}% · 90%: ${prev.uncertainty.bandWidth90Pct.toFixed(1)}%`,
    after: `50%: ${cur.uncertainty.bandWidth50Pct.toFixed(1)}% · 90%: ${cur.uncertainty.bandWidth90Pct.toFixed(1)}%`,
    explanation: uncChanged
      ? `The 90% band is ${w90 > 0 ? "wider" : "narrower"} by ${Math.abs(w90).toFixed(1)} pp. ${
          cur.inputs.volScaleApplied !== prev.inputs.volScaleApplied
            ? `The volatility scale moved from ${prev.inputs.volScaleApplied.toFixed(2)}× to ${cur.inputs.volScaleApplied.toFixed(2)}× (current 30D vol ${volPct(prev.inputs.vol30Ann)} → ${volPct(cur.inputs.vol30Ann)}).`
            : "The return sample changed as the training window rolled forward."
        }`
      : `Band widths changed by less than ${CHANGE_THRESHOLDS.widthPp} pp.`,
  });

  // Regime
  const regimeChanged = prev.inputs.regime !== cur.inputs.regime;
  items.push({
    kind: "regime",
    title: "Market regime",
    changed: regimeChanged,
    before: prev.inputs.regime,
    after: cur.inputs.regime,
    explanation: regimeChanged
      ? `The regime classification changed. ${cur.inputs.regimeExplanation} Regime is an explanatory input; it affects the model through the volatility scale.`
      : "Unchanged.",
  });

  // Inputs
  const inputDiffs: string[] = [];
  const dv = cur.inputs.vol30Ann !== null && prev.inputs.vol30Ann !== null ? (cur.inputs.vol30Ann - prev.inputs.vol30Ann) * 100 : null;
  if (dv !== null && Math.abs(dv) >= CHANGE_THRESHOLDS.volPp) inputDiffs.push(`30D volatility ${volPct(prev.inputs.vol30Ann)} → ${volPct(cur.inputs.vol30Ann)}`);
  if (cur.inputs.btcCorr90 !== null && prev.inputs.btcCorr90 !== null && Math.abs(cur.inputs.btcCorr90 - prev.inputs.btcCorr90) >= CHANGE_THRESHOLDS.corr)
    inputDiffs.push(`BTC correlation ${prev.inputs.btcCorr90.toFixed(2)} → ${cur.inputs.btcCorr90.toFixed(2)}`);
  if (Math.abs(anchorChg) >= CHANGE_THRESHOLDS.anchorPct) inputDiffs.push(`anchor price ${px(prev.inputs.anchorPrice)} → ${px(cur.inputs.anchorPrice)}`);
  if (prev.uncertainty.returnSampleSize !== cur.uncertainty.returnSampleSize)
    inputDiffs.push(`return sample ${prev.uncertainty.returnSampleSize} → ${cur.uncertainty.returnSampleSize} days`);
  items.push({
    kind: "inputs",
    title: "Model inputs",
    changed: inputDiffs.length > 0,
    before: `as of ${prev.asOfDate}`,
    after: `as of ${cur.asOfDate}`,
    explanation: inputDiffs.length
      ? `Material input changes: ${inputDiffs.join("; ")}. The training window rolled forward from ${prev.asOfDate} to ${cur.asOfDate}.`
      : `No material input changes; the training window rolled forward from ${prev.asOfDate} to ${cur.asOfDate}.`,
  });

  // Model version
  const verChanged = prev.modelVersion !== cur.modelVersion || prev.modelName !== cur.modelName;
  items.push({
    kind: "model_version",
    title: "Model version",
    changed: verChanged,
    before: `${prev.modelName} v${prev.modelVersion}`,
    after: `${cur.modelName} v${cur.modelVersion}`,
    explanation: verChanged ? "A different model version produced the new forecast — see the model changelog. Earlier records are kept unchanged." : "Same model version.",
  });

  const changed = items.filter((i) => i.changed).map((i) => i.title.toLowerCase());
  const summary = changed.length
    ? `Compared with the ${prev.source === "published" ? "previous published" : "re-computed"} forecast as of ${prev.asOfDate}: ${changed.join(", ")} changed.`
    : `No material changes compared with the ${prev.source === "published" ? "previous published" : "re-computed"} forecast as of ${prev.asOfDate}.`;
  return {
    current: { asOfDate: cur.asOfDate, modelVersion: cur.modelVersion },
    previous: { asOfDate: prev.asOfDate, modelVersion: prev.modelVersion, source: prev.source },
    items,
    summary,
  };
}
