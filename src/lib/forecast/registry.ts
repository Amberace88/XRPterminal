/**
 * Model registry & changelog (spec §66, §203, §204). Client-safe constants; the same metadata is
 * seeded into public.models / public.model_changelog by supabase/migrations/0030_forecast.sql.
 */
import { BASELINES } from "./baselines";
import { GATING_RULE_TEXT } from "./horizons";
import { DEFAULT_PARAMS, EVAL_PATHS, MODEL_NAME, MODEL_VERSION } from "./model";

export interface ModelRegistryEntry {
  modelName: string;
  version: string;
  purpose: string;
  owner: string;
  inputs: string[];
  parameters: Record<string, unknown>;
  trainingPeriod: string;
  evaluation: string;
  limitations: string[];
  createdAt: string;
}

export const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    modelName: MODEL_NAME,
    version: MODEL_VERSION,
    purpose: "Scenario ranges (BEAR/BASE/BULL/EXTREME) for XRP-USD terminal price at 7D–1Y horizons. Ranges, never point targets.",
    owner: "XRP Terminal — Quant Research",
    inputs: [
      "Daily closes XRP-USD (single provider, completed UTC candles)",
      "Trailing daily log returns (training window)",
      "Current 30D realized volatility vs training-window volatility",
      "Explanatory only: regime, 200D trend, BTC correlation, historical analogue",
    ],
    parameters: { ...DEFAULT_PARAMS, evalPaths: EVAL_PATHS, seedRule: "hash(model|version|asOfDate|horizon)", gating: GATING_RULE_TEXT },
    trainingPeriod: `Trailing ${DEFAULT_PARAMS.trainingWindowDays} daily returns ending at each as-of date (training cutoff = as-of date).`,
    evaluation: "Walk-forward: weekly as-of dates after a 365-day minimum window, fit on data ≤ as-of only; compared with naive persistence, 20D moving average, historical median and historical analogue baselines.",
    limitations: [
      "Cannot generate moves larger than those in its return sample; true tails may be wider.",
      "No drift — does not forecast direction.",
      "No fundamental, on-ledger, news, regulatory or liquidity inputs.",
      "Non-stationarity: past calibration may not persist.",
      "Horizons ≥ 3Y disabled: insufficient independent history.",
    ],
    createdAt: "2026-09-28",
  },
];

export const BASELINE_REGISTRY = BASELINES;

export interface ModelChangelogEntry {
  modelName: string;
  oldVersion: string | null;
  newVersion: string;
  reason: string;
  metrics: string;
  effectiveDate: string;
}

export const MODEL_CHANGELOG: ModelChangelogEntry[] = [
  {
    modelName: MODEL_NAME,
    oldVersion: null,
    newVersion: MODEL_VERSION,
    reason: "Initial release: stationary block bootstrap with volatility scaling and deterministic seeding.",
    metrics: "Walk-forward metrics are computed live from the full history and shown on /future (Model benchmark).",
    effectiveDate: "2026-09-28",
  },
];
