/**
 * Market Regime & Risk engines (spec §23, §24). Deterministic, explainable.
 * Inputs are daily candles. Output describes CURRENT measurable conditions only.
 */
import type { Candle } from "@/lib/types/market";
import { atr, logReturns, percentileRank, rollingVolatility, sma } from "./indicators";

export type Regime = "TRENDING UP" | "TRENDING DOWN" | "RANGE" | "HIGH VOLATILITY" | "LOW VOLATILITY" | "TRANSITION" | "UNKNOWN";
export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export interface RegimeInput {
  name: string;
  value: string;
  note: string;
}

export interface RegimeResult {
  regime: Regime;
  asOf: number;
  inputs: RegimeInput[];
  explanation: string;
  metrics: {
    close: number;
    sma50: number | null;
    sma200: number | null;
    slope50Pct: number | null; // 20-day slope of SMA50, %
    vol30: number | null; // annualized
    volPercentile: number | null; // vs full history
    atrPct: number | null;
    ret30: number | null; // %
    ret90: number | null;
    distFrom200Pct: number | null;
  };
  methodologyVersion: string;
}

export const REGIME_MODEL_VERSION = "regime-v1.0";

export function computeRegime(daily: Candle[]): RegimeResult {
  const n = daily.length;
  const empty: RegimeResult = {
    regime: "UNKNOWN",
    asOf: daily[n - 1]?.t ?? 0,
    inputs: [],
    explanation: "Insufficient daily history (need ≥ 220 days) to classify the regime.",
    metrics: { close: daily[n - 1]?.c ?? NaN, sma50: null, sma200: null, slope50Pct: null, vol30: null, volPercentile: null, atrPct: null, ret30: null, ret90: null, distFrom200Pct: null },
    methodologyVersion: REGIME_MODEL_VERSION,
  };
  if (n < 220) return empty;
  const closes = daily.map((c) => c.c);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const vol = rollingVolatility(closes, 30);
  const a = atr(daily, 14);
  const i = n - 1;
  const close = closes[i];
  const sma50 = s50[i];
  const sma200 = s200[i];
  const sma50prev = s50[i - 20];
  const slope50Pct = sma50 !== null && sma50prev !== null ? (sma50 / sma50prev - 1) * 100 : null;
  const vol30 = vol[i];
  const volHist = vol.filter((v): v is number => v !== null);
  const volPercentile = vol30 !== null ? percentileRank(volHist, vol30) : null;
  const atrPct = a[i] !== null ? ((a[i] as number) / close) * 100 : null;
  const ret30 = (close / closes[i - 30] - 1) * 100;
  const ret90 = (close / closes[i - 90] - 1) * 100;
  const distFrom200Pct = sma200 !== null ? (close / sma200 - 1) * 100 : null;

  // --- classification rules (documented) ---
  let regime: Regime = "RANGE";
  const reasons: string[] = [];
  const above50 = sma50 !== null && close > sma50;
  const above200 = sma200 !== null && close > sma200;
  const trendUp = above50 && above200 && sma50 !== null && sma200 !== null && sma50 > sma200 && (slope50Pct ?? 0) > 2;
  const trendDown = !above50 && !above200 && sma50 !== null && sma200 !== null && sma50 < sma200 && (slope50Pct ?? 0) < -2;

  if (volPercentile !== null && volPercentile >= 85) {
    regime = "HIGH VOLATILITY";
    reasons.push(`30D realized volatility is at the ${volPercentile.toFixed(0)}th percentile of its history (≥85th).`);
  } else if (trendUp) {
    regime = "TRENDING UP";
    reasons.push("Price is above its 50D and 200D averages, the 50D is above the 200D and has risen >2% over 20 days.");
  } else if (trendDown) {
    regime = "TRENDING DOWN";
    reasons.push("Price is below its 50D and 200D averages, the 50D is below the 200D and has fallen >2% over 20 days.");
  } else if (volPercentile !== null && volPercentile <= 15) {
    regime = "LOW VOLATILITY";
    reasons.push(`30D realized volatility is at the ${volPercentile.toFixed(0)}th percentile of its history (≤15th).`);
  } else if (above50 !== above200) {
    regime = "TRANSITION";
    reasons.push("Price sits between its 50D and 200D averages — trend signals disagree.");
  } else {
    regime = "RANGE";
    reasons.push("No sustained trend by the moving-average rules and volatility is within its normal band.");
  }

  const fmt = (v: number | null, d = 2, suf = "") => (v === null ? "n/a" : `${v.toFixed(d)}${suf}`);
  const inputs: RegimeInput[] = [
    { name: "Close vs 50D SMA", value: sma50 ? `${fmt((close / sma50 - 1) * 100, 1, "%")}` : "n/a", note: above50 ? "above" : "below" },
    { name: "Close vs 200D SMA", value: fmt(distFrom200Pct, 1, "%"), note: above200 ? "above" : "below" },
    { name: "50D SMA 20-day slope", value: fmt(slope50Pct, 2, "%"), note: "trend persistence" },
    { name: "30D realized volatility", value: vol30 !== null ? `${(vol30 * 100).toFixed(0)}% ann.` : "n/a", note: `percentile ${fmt(volPercentile, 0)}` },
    { name: "ATR(14) / price", value: fmt(atrPct, 2, "%"), note: "average daily range" },
    { name: "30D / 90D return", value: `${fmt(ret30, 1, "%")} / ${fmt(ret90, 1, "%")}`, note: "momentum" },
  ];
  return {
    regime,
    asOf: daily[i].t,
    inputs,
    explanation: reasons.join(" ") + " Regime describes present conditions and does not predict future direction.",
    metrics: { close, sma50, sma200, slope50Pct, vol30, volPercentile, atrPct, ret30, ret90, distFrom200Pct },
    methodologyVersion: REGIME_MODEL_VERSION,
  };
}

export interface RiskResult {
  level: RiskLevel;
  score: number; // 0-100
  components: { name: string; score: number; weight: number; detail: string }[];
  asOf: number;
  explanation: string;
}

/** Risk score from measurable inputs. Elevated risk ≠ "XRP will crash". */
export function computeRisk(daily: Candle[], regime: RegimeResult): RiskResult {
  const n = daily.length;
  if (n < 220 || regime.regime === "UNKNOWN") {
    return { level: "MODERATE", score: NaN, components: [], asOf: daily[n - 1]?.t ?? 0, explanation: "Insufficient history to compute a risk score." };
  }
  const closes = daily.map((c) => c.c);
  // 1) volatility percentile
  const volScore = regime.metrics.volPercentile ?? 50;
  // 2) drawdown from 1-year high
  const yearHigh = Math.max(...closes.slice(-365));
  const dd = (1 - closes[n - 1] / yearHigh) * 100;
  const ddScore = Math.min(100, (dd / 60) * 100);
  // 3) regime
  const regimeScore = { "HIGH VOLATILITY": 90, "TRENDING DOWN": 70, TRANSITION: 55, RANGE: 40, "LOW VOLATILITY": 30, "TRENDING UP": 35, UNKNOWN: 50 }[regime.regime];
  // 4) abnormal volume: last 7d avg vs 90d avg
  const v7 = daily.slice(-7).reduce((a, c) => a + c.v, 0) / 7;
  const v90 = daily.slice(-90).reduce((a, c) => a + c.v, 0) / 90;
  const volRatio = v90 > 0 ? v7 / v90 : 1;
  const volumeScore = Math.max(0, Math.min(100, (Math.abs(volRatio - 1) / 1.5) * 100));
  // 5) tail risk: share of |daily return| > 10% in last 90 days
  const r = logReturns(closes.slice(-91)).filter((x): x is number => x !== null);
  const tails = r.filter((x) => Math.abs(x) > 0.1).length;
  const tailScore = Math.min(100, (tails / 6) * 100);

  const components = [
    { name: "Volatility percentile", score: volScore, weight: 0.3, detail: `30D vol at ${volScore.toFixed(0)}th percentile` },
    { name: "Drawdown from 1Y high", score: ddScore, weight: 0.25, detail: `${dd.toFixed(1)}% below 365-day high` },
    { name: "Regime", score: regimeScore, weight: 0.2, detail: regime.regime },
    { name: "Abnormal volume", score: volumeScore, weight: 0.1, detail: `7D/90D volume ratio ${volRatio.toFixed(2)}×` },
    { name: "Tail moves (90D)", score: tailScore, weight: 0.15, detail: `${tails} day(s) with |move| > 10%` },
  ];
  const score = components.reduce((a, c) => a + c.score * c.weight, 0);
  const level: RiskLevel = score >= 70 ? "HIGH" : score >= 52 ? "ELEVATED" : score >= 35 ? "MODERATE" : "LOW";
  return {
    level,
    score,
    components,
    asOf: daily[n - 1].t,
    explanation: `Weighted score ${score.toFixed(0)}/100 from volatility, drawdown, regime, volume and tail-move inputs. It measures current risk conditions — it is not a forecast of a decline.`,
  };
}
