/**
 * Immutable forecast records (spec §61, §205, §206).
 *
 * - `content_hash` = SHA-256 of the IDENTITY (asset, horizon, as-of date, model name, model version).
 *   It is UNIQUE in the database, which makes the daily publish job idempotent: one published record
 *   per as-of date × horizon × model version. A new model version ⇒ a new record, never an overwrite.
 * - `payload_hash` = SHA-256 of the canonical JSON of the full forecast content, so anyone can verify
 *   a stored record was not altered and that a live re-computation reproduces it.
 */
import { roundSig } from "./stats";
import type { ForecastInputs, ForecastOutput, ForecastUncertainty, Quantiles, Scenario } from "./types";

/** Canonical JSON: sorted keys, finite numbers rounded to 10 significant digits, no undefined. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? roundSig(v, 10) : null;
    if (Array.isArray(v)) return v.map(norm);
    if (v instanceof Float64Array || v instanceof Float32Array) return Array.from(v).map(norm);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) if (o[k] !== undefined) out[k] = norm(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/** SHA-256 hex via Web Crypto (available in Node ≥ 20 and all modern browsers). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function identityKey(f: Pick<ForecastOutput, "asset" | "horizonDays" | "asOfDate" | "modelName" | "modelVersion">): string {
  return canonicalJson({ asset: f.asset, horizon_days: f.horizonDays, as_of_date: f.asOfDate, model_name: f.modelName, model_version: f.modelVersion });
}

/** Content that is hashed & stored (excludes computedAt and the chart-only fan). */
export function forecastPayload(f: ForecastOutput) {
  return {
    asset: f.asset,
    horizon_days: f.horizonDays,
    as_of_date: f.asOfDate,
    target_date: f.targetDate,
    model_name: f.modelName,
    model_version: f.modelVersion,
    training_start: f.trainingStart,
    training_end: f.trainingEnd,
    data_provider: f.dataProvider,
    quantiles: f.quantiles,
    scenarios: f.scenarios,
    inputs: f.inputs,
    uncertainty: f.uncertainty,
    assumptions: f.assumptions,
    parameters: f.parameters,
  };
}

export async function contentHash(f: ForecastOutput): Promise<string> {
  return sha256Hex(identityKey(f));
}

export async function payloadHash(f: ForecastOutput): Promise<string> {
  return sha256Hex(canonicalJson(forecastPayload(f)));
}

/** Row shape of public.forecasts (see supabase/migrations/0030_forecast.sql). */
export interface ForecastRow {
  id?: string;
  asset: string;
  horizon_days: number;
  as_of: string; // timestamptz (UTC open of the as-of daily candle)
  created_at?: string;
  target_date: string;
  model_name: string;
  model_version: string;
  inputs: ForecastInputs;
  scenarios: Scenario[];
  quantiles: Quantiles;
  uncertainty: ForecastUncertainty;
  assumptions: { list: string[]; parameters: ForecastOutput["parameters"] };
  training_start: string;
  training_end: string;
  data_provider: string;
  content_hash: string;
  payload_hash: string;
}

export async function toForecastRow(f: ForecastOutput): Promise<ForecastRow> {
  return {
    asset: f.asset,
    horizon_days: f.horizonDays,
    as_of: new Date(f.asOf).toISOString(),
    target_date: f.targetDate,
    model_name: f.modelName,
    model_version: f.modelVersion,
    inputs: f.inputs,
    scenarios: f.scenarios,
    quantiles: f.quantiles,
    uncertainty: f.uncertainty,
    assumptions: { list: f.assumptions, parameters: f.parameters },
    training_start: f.trainingStart,
    training_end: f.trainingEnd,
    data_provider: f.dataProvider,
    content_hash: await contentHash(f),
    payload_hash: await payloadHash(f),
  };
}

/** Row shape of public.forecast_evaluations. */
export interface ForecastEvaluationRow {
  id?: string;
  forecast_id: string;
  evaluated_at?: string;
  target_date: string;
  actual_price: number;
  error: number; // P50 − actual
  abs_pct_error: number; // |P50 − actual| / actual × 100
  in_p25_p75: boolean;
  in_p5_p95: boolean;
  direction_correct: boolean | null; // null when the median made no directional call
  model_version: string;
  data_provider: string;
}

/** Deterministic evaluation of one matured forecast against the realized close. */
export function evaluateForecastRow(
  f: Pick<ForecastRow, "quantiles" | "inputs" | "model_version" | "target_date"> & { id: string },
  actual: number,
  dataProvider: string,
): ForecastEvaluationRow {
  const q = f.quantiles;
  const anchor = f.inputs.anchorPrice;
  const moved = Math.abs(q.p50 / anchor - 1) > 0.001;
  return {
    forecast_id: f.id,
    target_date: f.target_date,
    actual_price: actual,
    error: q.p50 - actual,
    abs_pct_error: (Math.abs(q.p50 - actual) / actual) * 100,
    in_p25_p75: actual >= q.p25 && actual <= q.p75,
    in_p5_p95: actual >= q.p05 && actual <= q.p95,
    direction_correct: moved && actual !== anchor ? Math.sign(q.p50 - anchor) === Math.sign(actual - anchor) : null,
    model_version: f.model_version,
    data_provider: dataProvider,
  };
}
