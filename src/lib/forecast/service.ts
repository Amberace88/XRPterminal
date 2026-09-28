import "server-only";
/**
 * Server-side orchestration for Future Intelligence: data loading, memoised model runs,
 * publication lookups and the cron jobs. Pure maths lives in the sibling modules.
 */
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candle, Provenance } from "@/lib/types/market";
import { getDailyHistory } from "@/lib/providers/market/registry";
import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { log } from "@/lib/server/api";
import type { CurrentForecastResponse, ForecastHistoryResponse, PublishedForecastItem } from "./api-types";
import { runBaselines } from "./baselines";
import { compareForecasts, snapshotOf, type ForecastSnapshot } from "./changes";
import { walkForward, type EvaluationReport } from "./evaluate";
import { allHorizonStatuses, horizonStatus, HORIZONS } from "./horizons";
import { MIN_HISTORY_DAYS, MODEL_VERSION, runScenarioModel } from "./model";
import { evaluateForecastRow, toForecastRow, type ForecastRow } from "./record";
import { completedDaily, isoDate } from "./stats";
import type { ForecastOutput } from "./types";

const ASSET = "XRP-USD" as const;

/* ------------------------------ memo cache ------------------------------ */
type MemoEntry<T> = { at: number; value: Promise<T> };
const memo = new Map<string, MemoEntry<unknown>>();
function remember<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as MemoEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = fn().catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 200) for (const [k, v] of memo) if (Date.now() - v.at > 6 * 3600_000) memo.delete(k);
  return value;
}

/* ------------------------------ data ------------------------------ */
export interface DailyData {
  candles: Candle[];
  provenance: Provenance;
}

/** Completed daily XRP-USD candles from a single provider (cached 15 min per instance). */
export function loadDaily(): Promise<DailyData> {
  return remember("daily:" + ASSET, 15 * 60_000, async () => {
    const s = await getDailyHistory(ASSET);
    const candles = completedDaily(s.candles, Date.now());
    if (candles.length < MIN_HISTORY_DAYS) throw new Error(`Insufficient daily history (${candles.length} completed candles).`);
    return {
      candles,
      provenance: {
        ...s.provenance,
        timestamp: candles[candles.length - 1].t,
        methodology: `${s.provenance.methodology ?? ""} Only completed UTC daily candles are used (in-progress candle excluded).`.trim(),
      },
    };
  });
}

/** BTC-USD daily (explanatory correlation input only). Failure is non-fatal. */
function loadBtc(): Promise<Candle[] | null> {
  return remember("daily:BTC-USD", 15 * 60_000, async () => {
    try {
      const s = await getDailyHistory("BTC-USD");
      return completedDaily(s.candles, Date.now());
    } catch (e) {
      log("warn", "forecast: BTC history unavailable", { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  });
}

/* ------------------------------ model runs ------------------------------ */
export async function computeForecast(horizonDays: number, asOfIndexBack = 0): Promise<{ forecast: ForecastOutput; data: DailyData }> {
  const data = await loadDaily();
  const btc = await loadBtc();
  const n = data.candles.length;
  const lastT = data.candles[n - 1].t;
  const forecast = await remember(`fc:${horizonDays}:${lastT}:${asOfIndexBack}`, 6 * 3600_000, async () => {
    const slice = asOfIndexBack > 0 ? data.candles.slice(0, n - asOfIndexBack) : data.candles;
    return runScenarioModel(slice, {
      horizonDays,
      btc,
      asset: ASSET,
      dataProvider: data.provenance.provider,
      historyDaysForGating: slice.length,
    });
  });
  return { forecast, data };
}

export async function computeEvaluation(horizonDays: number): Promise<{ report: EvaluationReport; data: DailyData }> {
  const data = await loadDaily();
  const lastT = data.candles[data.candles.length - 1].t;
  const report = await remember(`eval:${horizonDays}:${lastT}`, 6 * 3600_000, async () => walkForward(data.candles, horizonDays));
  return { report, data };
}

/* ------------------------------ publication ------------------------------ */
interface PublishedRowLite {
  id: string;
  created_at: string;
  payload_hash: string;
  content_hash: string;
}

async function readClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  return (await getSupabaseServer()) ?? getSupabaseAdmin();
}

type DbForecastRow = ForecastRow & { id: string; created_at: string };

function snapshotFromRow(r: DbForecastRow): ForecastSnapshot {
  return {
    asOfDate: r.as_of.slice(0, 10),
    modelName: r.model_name,
    modelVersion: r.model_version,
    horizonDays: r.horizon_days,
    quantiles: r.quantiles,
    inputs: r.inputs,
    uncertainty: {
      bandWidth50Pct: r.uncertainty.bandWidth50Pct,
      bandWidth90Pct: r.uncertainty.bandWidth90Pct,
      returnSampleSize: r.uncertainty.returnSampleSize,
    },
    source: "published",
  };
}

export async function buildCurrentResponse(horizonDays: number): Promise<CurrentForecastResponse> {
  const { forecast, data } = await computeForecast(horizonDays);
  const n = data.candles.length;
  const row = await toForecastRow(forecast);
  const pub: CurrentForecastResponse["publication"] = {
    status: "db_not_configured",
    label: "Computed now — not yet published (published forecast history requires the database)",
    contentHash: row.content_hash,
    payloadHash: row.payload_hash,
  };
  let previous: ForecastSnapshot | null = null;
  const sb = await readClient();
  if (sb) {
    try {
      const { data: same, error } = await sb
        .from("forecasts")
        .select("id, created_at, payload_hash, content_hash")
        .eq("content_hash", row.content_hash)
        .maybeSingle<PublishedRowLite>();
      if (error) throw error;
      if (same) {
        pub.status = "published";
        pub.recordId = same.id;
        pub.publishedAt = same.created_at;
        pub.payloadVerified = same.payload_hash === row.payload_hash;
        pub.label = pub.payloadVerified ? "Published — stored record matches this computation" : "Published — stored record differs from live re-computation (data revision)";
      } else {
        pub.status = "not_published";
        pub.label = "Computed now — not yet published for this as-of date";
      }
      const { data: prev } = await sb
        .from("forecasts")
        .select("*")
        .eq("asset", ASSET)
        .eq("horizon_days", horizonDays)
        .lt("as_of", new Date(forecast.asOf).toISOString())
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle<DbForecastRow>();
      if (prev) previous = snapshotFromRow(prev);
    } catch (e) {
      pub.status = "db_error";
      pub.label = "Computed now — publication status unavailable (database error)";
      log("warn", "forecast: publication lookup failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!previous && n - 7 >= MIN_HISTORY_DAYS) {
    // No published record: re-compute the model as of 7 days earlier using only data ≤ that date.
    const { forecast: prevF } = await computeForecast(horizonDays, 7);
    previous = snapshotOf(prevF, "computed");
  }
  const history = data.candles.slice(-180).map((c) => ({ t: c.t, c: c.c }));
  return {
    forecast,
    horizons: allHorizonStatuses(n),
    history,
    baselines: runBaselines(data.candles, horizonDays),
    publication: pub,
    whatChanged: previous ? compareForecasts(previous, snapshotOf(forecast)) : null,
    provenance: data.provenance,
  };
}

export async function buildHistoryResponse(horizonDays: number | null, limit: number): Promise<ForecastHistoryResponse> {
  const sb = await readClient();
  if (!sb) return { configured: false, reason: "Published forecast history requires the database (Supabase is not configured)." };
  let q = sb
    .from("forecasts")
    .select(
      "id, asset, horizon_days, as_of, created_at, target_date, model_name, model_version, quantiles, uncertainty, inputs, data_provider, content_hash, payload_hash, forecast_evaluations(evaluated_at, actual_price, abs_pct_error, in_p25_p75, in_p5_p95, direction_correct)",
    )
    .eq("asset", ASSET)
    .order("as_of", { ascending: false })
    .limit(limit);
  if (horizonDays) q = q.eq("horizon_days", horizonDays);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Raw = DbForecastRow & { forecast_evaluations: PublishedForecastItem["evaluation"][] | PublishedForecastItem["evaluation"] | null };
  const forecasts: PublishedForecastItem[] = ((data ?? []) as unknown as Raw[]).map((r) => {
    const ev = Array.isArray(r.forecast_evaluations) ? (r.forecast_evaluations[0] ?? null) : (r.forecast_evaluations ?? null);
    return {
      id: r.id,
      asset: r.asset,
      horizon_days: r.horizon_days,
      as_of: r.as_of,
      created_at: r.created_at,
      target_date: r.target_date,
      model_name: r.model_name,
      model_version: r.model_version,
      quantiles: r.quantiles,
      uncertainty: { bandWidth50Pct: r.uncertainty?.bandWidth50Pct, bandWidth90Pct: r.uncertainty?.bandWidth90Pct, lowSample: r.uncertainty?.lowSample },
      anchor_price: r.inputs?.anchorPrice ?? null,
      regime: r.inputs?.regime ?? null,
      data_provider: r.data_provider,
      content_hash: r.content_hash,
      payload_hash: r.payload_hash,
      evaluation: ev,
    };
  });
  const evald = forecasts.filter((f) => f.evaluation);
  const share = (fn: (f: PublishedForecastItem) => boolean) => (evald.length ? (evald.filter(fn).length / evald.length) * 100 : null);
  return {
    configured: true,
    forecasts,
    summary: {
      n: forecasts.length,
      evaluated: evald.length,
      coverage50: share((f) => !!f.evaluation?.in_p25_p75),
      coverage90: share((f) => !!f.evaluation?.in_p5_p95),
      mape: evald.length ? evald.reduce((a, f) => a + (f.evaluation?.abs_pct_error ?? 0), 0) / evald.length : null,
    },
  };
}

/* ------------------------------ cron jobs ------------------------------ */
export function verifyCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  const got = req.headers.get("x-cron-secret") || "";
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PublishResult {
  asOfDate: string;
  modelVersion: string;
  inserted: { horizonDays: number; id: string }[];
  alreadyPublished: number[];
  skipped: { horizonDays: number; reason: string }[];
}

/** Publish today's forecasts for all non-disabled horizons. Idempotent via the unique content_hash. */
export async function publishForecasts(): Promise<PublishResult> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("DB_NOT_CONFIGURED");
  const data = await loadDaily();
  const n = data.candles.length;
  const res: PublishResult = { asOfDate: isoDate(data.candles[n - 1].t), modelVersion: MODEL_VERSION, inserted: [], alreadyPublished: [], skipped: [] };
  const rows: ForecastRow[] = [];
  for (const h of HORIZONS) {
    const st = horizonStatus(n, h.days, h.key);
    if (st.status === "disabled") {
      res.skipped.push({ horizonDays: h.days, reason: st.reason });
      continue;
    }
    const { forecast } = await computeForecast(h.days);
    rows.push(await toForecastRow(forecast));
  }
  if (rows.length) {
    const { data: ins, error } = await sb.from("forecasts").upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true }).select("id, horizon_days");
    if (error) throw new Error(error.message);
    const insertedH = new Set<number>();
    for (const r of (ins ?? []) as { id: string; horizon_days: number }[]) {
      res.inserted.push({ horizonDays: r.horizon_days, id: r.id });
      insertedH.add(r.horizon_days);
    }
    for (const r of rows) if (!insertedH.has(r.horizon_days)) res.alreadyPublished.push(r.horizon_days);
  }
  log("info", "forecast: publish", { asOf: res.asOfDate, inserted: res.inserted.length, already: res.alreadyPublished.length });
  return res;
}

export interface EvaluateJobResult {
  checked: number;
  evaluated: number;
  pending: number;
  missingActual: string[];
}

/** Evaluate every matured, not-yet-evaluated published forecast against the realized close. */
export async function evaluateMaturedForecasts(): Promise<EvaluateJobResult> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("DB_NOT_CONFIGURED");
  const data = await loadDaily();
  const lastDate = isoDate(data.candles[data.candles.length - 1].t);
  const closeByDate = new Map(data.candles.map((c) => [isoDate(c.t), c.c]));
  const { data: due, error } = await sb
    .from("forecasts")
    .select("id, quantiles, inputs, model_version, target_date, data_provider, forecast_evaluations(id)")
    .lte("target_date", lastDate)
    .is("forecast_evaluations", null) // anti-join: only forecasts without an evaluation (PostgREST ≥ 11)
    .order("target_date", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  // forecast_evaluations.forecast_id is UNIQUE, so PostgREST may embed an object (1:1) or an array.
  type Due = Pick<ForecastRow, "quantiles" | "inputs" | "model_version" | "target_date" | "data_provider"> & {
    id: string;
    forecast_evaluations: { id: string }[] | { id: string } | null;
  };
  const hasEval = (e: Due["forecast_evaluations"]) => (Array.isArray(e) ? e.length > 0 : !!e);
  const pendingRows = ((due ?? []) as unknown as Due[]).filter((r) => !hasEval(r.forecast_evaluations));
  const out: EvaluateJobResult = { checked: (due ?? []).length, evaluated: 0, pending: 0, missingActual: [] };
  const evals = [];
  for (const r of pendingRows) {
    const actual = closeByDate.get(r.target_date);
    if (actual === undefined) {
      out.missingActual.push(r.target_date);
      continue;
    }
    evals.push(evaluateForecastRow(r, actual, data.provenance.provider));
  }
  if (evals.length) {
    const { data: ins, error: e2 } = await sb.from("forecast_evaluations").upsert(evals, { onConflict: "forecast_id", ignoreDuplicates: true }).select("id");
    if (e2) throw new Error(e2.message);
    out.evaluated = (ins ?? []).length;
  }
  // count forecasts not yet matured
  const { count } = await sb.from("forecasts").select("id", { count: "exact", head: true }).gt("target_date", lastDate);
  out.pending = count ?? 0;
  log("info", "forecast: evaluate", { ...out, missingActual: out.missingActual.length });
  return out;
}
