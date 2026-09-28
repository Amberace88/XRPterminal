/**
 * Response shapes of the /api/forecast/* routes (client-safe types).
 */
import type { Provenance } from "@/lib/types/market";
import type { WhatChanged } from "./changes";
import type { EvaluationReport } from "./evaluate";
import type { BaselineResult, ForecastInputs, ForecastOutput, HorizonStatus, Quantiles, ForecastUncertainty } from "./types";

export type PublicationStatus = "published" | "not_published" | "db_not_configured" | "db_error";

export interface CurrentForecastResponse {
  forecast: ForecastOutput;
  horizons: HorizonStatus[];
  /** Last ~180 completed daily closes (for the fan chart). */
  history: { t: number; c: number }[];
  baselines: BaselineResult[];
  publication: {
    status: PublicationStatus;
    /** Human-readable status, e.g. "Computed now — not yet published". */
    label: string;
    recordId?: string;
    publishedAt?: string;
    contentHash: string;
    payloadHash: string;
    /** True when the stored payload hash equals the live re-computation. */
    payloadVerified?: boolean;
  };
  whatChanged: WhatChanged | null;
  provenance: Provenance;
}

export interface EvaluationResponse {
  report: EvaluationReport;
  horizon: HorizonStatus;
  provenance: Provenance;
}

export interface PublishedForecastItem {
  id: string;
  asset: string;
  horizon_days: number;
  as_of: string;
  created_at: string;
  target_date: string;
  model_name: string;
  model_version: string;
  quantiles: Quantiles;
  uncertainty: Pick<ForecastUncertainty, "bandWidth50Pct" | "bandWidth90Pct" | "lowSample">;
  anchor_price: number | null;
  regime: string | null;
  data_provider: string;
  content_hash: string;
  payload_hash: string;
  evaluation: {
    evaluated_at: string;
    actual_price: number;
    abs_pct_error: number;
    in_p25_p75: boolean;
    in_p5_p95: boolean;
    direction_correct: boolean | null;
  } | null;
}

export type ForecastHistoryResponse =
  | { configured: false; reason: string }
  | {
      configured: true;
      forecasts: PublishedForecastItem[];
      summary: { n: number; evaluated: number; coverage50: number | null; coverage90: number | null; mape: number | null };
    };

export type { ForecastInputs };
