/**
 * Future Intelligence — shared types (spec §55–67, §203–209).
 * Pure type module: safe to import from server, client and tests.
 */

export type HorizonKey = "7D" | "30D" | "90D" | "180D" | "1Y" | "3Y" | "5Y";
export type HorizonStatusKind = "enabled" | "low_sample" | "disabled";

export interface HorizonStatus {
  key: HorizonKey;
  days: number;
  status: HorizonStatusKind;
  /** Non-overlapping H-day windows in the available history. */
  independentWindows: number;
  /** Approximate number of independent (non-overlapping) walk-forward evaluation windows. */
  walkForwardIndependent: number;
  /** Plain-language explanation of the gating decision. */
  reason: string;
}

/** Quantile levels reported by every model (terminal price). */
export const QUANTILE_LEVELS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] as const;
export type QuantileKey = "p01" | "p05" | "p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "p99";
export const QUANTILE_KEYS: QuantileKey[] = ["p01", "p05", "p10", "p25", "p50", "p75", "p90", "p95", "p99"];
export type Quantiles = Record<QuantileKey, number>;

export type ScenarioKind = "BEAR" | "BASE" | "BULL" | "EXTREME";

export interface ScenarioRange {
  low: number;
  high: number;
  /** % change of `low`/`high` vs the anchor price (last completed daily close). */
  lowPct: number;
  highPct: number;
}

export interface Scenario {
  kind: ScenarioKind;
  label: string;
  /** Quantile band definition, e.g. "P5–P25". */
  band: string;
  /** Share of simulated paths whose terminal price falls in this scenario (model-implied, not a probability promise). */
  pathShare: number;
  range: ScenarioRange;
  /** EXTREME only: the lower (P1–P5) and upper (P95–P99) tails. */
  tails?: { lower: ScenarioRange; upper: ScenarioRange };
  assumptions: string[];
  drivers: string[];
  risks: string[];
  invalidation: string[];
  lessApplicableIf: string[];
}

export interface AnalogueStats {
  criteria: string;
  n: number;
  independentN: number;
  medianReturnPct: number | null;
  p25ReturnPct: number | null;
  p75ReturnPct: number | null;
  shareUpPct: number | null;
}

/** Measurable inputs used by the model and to explain it (spec §58). */
export interface ForecastInputs {
  anchorPrice: number;
  anchorDate: string; // YYYY-MM-DD (UTC daily candle)
  vol30Ann: number | null; // current 30D realized vol, annualized (fraction)
  volTrainAnn: number; // training-window vol, annualized
  volRatioRaw: number | null;
  volScaleApplied: number; // clamped ratio at t=0
  volPercentile: number | null; // 0–100 vs training history
  volP10Ann: number | null; // 10th percentile of rolling 30D vol in the training window
  volP90Ann: number | null; // 90th percentile of rolling 30D vol in the training window
  regime: string;
  regimeExplanation: string;
  distFrom200Pct: number | null;
  ret30Pct: number | null;
  ret90Pct: number | null;
  btcCorr90: number | null;
  btcCorrNote: string;
  analogue: AnalogueStats | null;
}

export interface ForecastUncertainty {
  bandWidth50Pct: number; // (P75−P25)/P50
  bandWidth90Pct: number; // (P95−P5)/P50
  returnSampleSize: number; // N daily returns bootstrapped
  independentWindows: number; // non-overlapping H-day windows in the full history
  paths: number;
  horizonStatus: HorizonStatusKind;
  lowSample: boolean;
  limitations: string[];
}

export interface FanPoint {
  t: number;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface ModelParameters {
  blockLength: number;
  paths: number;
  trainingWindowDays: number;
  volScaling: boolean;
  volClamp: [number, number];
  volDecayDays: number;
  demeaned: boolean;
  seed: number;
}

export interface ForecastOutput {
  asset: string; // "XRP-USD"
  modelName: string;
  modelVersion: string;
  horizonKey: HorizonKey | null;
  horizonDays: number;
  asOf: number; // open time (UTC ms) of the last completed daily candle used
  asOfDate: string;
  targetDate: string;
  computedAt: number;
  trainingStart: string;
  trainingEnd: string; // == training cutoff (no data after this date is used)
  dataProvider: string;
  quantiles: Quantiles;
  scenarios: Scenario[];
  inputs: ForecastInputs;
  uncertainty: ForecastUncertainty;
  assumptions: string[];
  parameters: ModelParameters;
  fan: FanPoint[];
}

/** A point forecast + band produced by any model (the scenario model or a baseline). */
export interface BandForecast {
  model: string;
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface BaselineResult extends BandForecast {
  label: string;
  description: string;
  available: boolean;
  note?: string;
}
