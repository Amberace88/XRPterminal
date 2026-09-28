/**
 * Market Health module (spec §25). Each component reports the current condition, its historical percentile,
 * a trend direction and the data timestamp. Deterministic; describes present conditions only.
 *
 * Components computed from daily candles: volatility, volume, momentum, trend, correlation (vs BTC), regime/risk.
 * Liquidity is computed from a live order book when one is supplied (no stored history → no percentile).
 * XRPL activity, exchange flows and concentration come from other modules and are reported as not connected here.
 */
import type { Candle } from "@/lib/types/market";
import { percentileRank, rollingVolatility, rsi, sma } from "./indicators";
import { computeRegime, computeRisk, type RegimeResult, type RiskResult } from "./regime";
import { trendOf, volBand } from "./history";
import { alignedLogReturns, rollingCorrelation } from "./correlation";

export type HealthTone = "good" | "neutral" | "caution" | "warning" | "muted";
export type HealthTrend = "up" | "down" | "flat" | null;

export interface HealthComponent {
  id: "volatility" | "volume" | "momentum" | "trend" | "correlation" | "regime" | "liquidity" | "xrpl" | "flows" | "concentration";
  name: string;
  available: boolean;
  condition: string;
  tone: HealthTone;
  value: string;
  /** 0–100 percentile vs the component's own history (null when no history). */
  percentile: number | null;
  /** What the percentile/history is measured against. */
  basis: string;
  trend: HealthTrend;
  trendNote: string;
  asOf: number | null;
  detail: string;
}

export interface LiveBookInput {
  spreadPct: number | null;
  /** Quote-currency depth within ±1% of mid (bids + asks). */
  depth1Pct: number | null;
  quote: string;
  asOf: number | null;
  venue: string;
}

export interface MarketHealth {
  components: HealthComponent[];
  regime: RegimeResult;
  risk: RiskResult;
  asOf: number | null;
}

const fmtPct = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);

function rollingMean(values: number[], w: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= w) s -= values[i - w];
    if (i >= w - 1) out[i] = s / w;
  }
  return out;
}

const nn = (a: (number | null)[]) => a.filter((x): x is number => x !== null && Number.isFinite(x));

export function computeMarketHealth(xrp: Candle[], btc?: Candle[] | null, liveBook?: LiveBookInput | null): MarketHealth {
  const n = xrp.length;
  const last = n - 1;
  const asOf = n ? xrp[last].t : null;
  const closes = xrp.map((k) => k.c);
  const regime = computeRegime(xrp);
  const risk = computeRisk(xrp, regime);
  const components: HealthComponent[] = [];
  const days = n;
  const basisDays = `vs ${days.toLocaleString("en-US")} daily closes`;

  // 1) Volatility
  {
    const v = rollingVolatility(closes, 30);
    const cur = n ? v[last] : null;
    const hist = nn(v);
    const pct = cur !== null ? percentileRank(hist, cur) : null;
    const band = volBand(pct);
    const prev = n > 10 ? v[last - 10] : null;
    const map = { LOW: ["Calm", "neutral"], NORMAL: ["Normal", "good"], ELEVATED: ["Elevated", "caution"], EXTREME: ["Extreme", "warning"] } as const;
    components.push({
      id: "volatility",
      name: "Volatility",
      available: cur !== null,
      condition: band ? map[band][0] : "Insufficient data",
      tone: band ? map[band][1] : "muted",
      value: cur !== null ? `${(cur * 100).toFixed(0)}% ann.` : "n/a",
      percentile: pct,
      basis: `30D realized vol ${basisDays}`,
      trend: trendOf(cur, prev, 0.05),
      trendNote: "30D vol vs 10 days ago",
      asOf,
      detail: "Annualized standard deviation of daily log returns over 30 days.",
    });
  }

  // 2) Volume (single provider, quote currency)
  {
    const qv = xrp.map((k) => k.v * k.c);
    const m30 = rollingMean(qv, 30);
    const m7 = rollingMean(qv, 7);
    const cur = n ? m30[last] : null;
    const pct = cur !== null ? percentileRank(nn(m30), cur) : null;
    const ratio = n && m7[last] !== null && cur ? (m7[last] as number) / cur : null;
    const cond = pct === null ? "Insufficient data" : pct < 20 ? "Thin" : pct < 80 ? "Normal" : "Heavy";
    components.push({
      id: "volume",
      name: "Volume",
      available: cur !== null,
      condition: cond,
      tone: pct === null ? "muted" : pct < 20 ? "caution" : "good",
      value: ratio !== null ? `7D/30D ${ratio.toFixed(2)}×` : "n/a",
      percentile: pct,
      basis: `30D avg quote volume ${basisDays} (single venue)`,
      trend: ratio === null ? null : ratio > 1.1 ? "up" : ratio < 0.9 ? "down" : "flat",
      trendNote: "7D average vs 30D average",
      asOf,
      detail: "Quote-currency volume on the history provider only — not total market volume.",
    });
  }

  // 3) Momentum
  {
    const r = rsi(closes, 14);
    const cur = n ? r[last] : null;
    const prev = n > 5 ? r[last - 5] : null;
    const ret30: (number | null)[] = closes.map((c, i) => (i >= 30 ? (c / closes[i - 30] - 1) * 100 : null));
    const curRet = n ? ret30[last] : null;
    const pct = curRet !== null ? percentileRank(nn(ret30), curRet) : null;
    const cond =
      cur === null ? "Insufficient data" : cur >= 70 ? "Overbought" : cur >= 55 ? "Positive" : cur > 45 ? "Neutral" : cur > 30 ? "Negative" : "Oversold";
    components.push({
      id: "momentum",
      name: "Momentum",
      available: cur !== null,
      condition: cond,
      tone: cur === null ? "muted" : cur >= 70 || cur <= 30 ? "caution" : "neutral",
      value: cur !== null ? `RSI ${cur.toFixed(0)} · 30D ${fmtPct(curRet)}` : "n/a",
      percentile: pct,
      basis: `30D return ${basisDays}`,
      trend: cur !== null && prev !== null ? (cur - prev > 3 ? "up" : cur - prev < -3 ? "down" : "flat") : null,
      trendNote: "RSI(14) vs 5 days ago",
      asOf,
      detail: "Wilder RSI(14) on daily closes and the trailing 30-day return.",
    });
  }

  // 4) Trend
  {
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const dist: (number | null)[] = closes.map((c, i) => (s200[i] !== null ? (c / (s200[i] as number) - 1) * 100 : null));
    const cur = n ? dist[last] : null;
    const pct = cur !== null ? percentileRank(nn(dist), cur) : null;
    const a50 = n ? s50[last] : null;
    const a200 = n ? s200[last] : null;
    const cond =
      cur === null || a50 === null || a200 === null
        ? "Insufficient data"
        : closes[last] > a200 && a50 > a200
          ? "Uptrend"
          : closes[last] < a200 && a50 < a200
            ? "Downtrend"
            : "Mixed";
    const prev50 = n > 20 ? s50[last - 20] : null;
    components.push({
      id: "trend",
      name: "Trend",
      available: cur !== null,
      condition: cond,
      tone: cond === "Uptrend" ? "good" : cond === "Downtrend" ? "caution" : cond === "Mixed" ? "neutral" : "muted",
      value: cur !== null ? `${fmtPct(cur)} vs 200D SMA` : "n/a",
      percentile: pct,
      basis: `distance from 200D SMA ${basisDays}`,
      trend: trendOf(a50, prev50, 0.02),
      trendNote: "50D SMA vs 20 days ago",
      asOf,
      detail: "Close relative to the 50D and 200D simple moving averages.",
    });
  }

  // 5) Correlation with BTC
  if (btc && btc.length > 120) {
    const pairs = alignedLogReturns(xrp, btc);
    const roll = rollingCorrelation(pairs, 90);
    const valid = roll.filter((x) => x.r !== null);
    const cur = valid.length ? (valid[valid.length - 1].r as number) : null;
    const pct = cur !== null ? percentileRank(valid.map((x) => x.r as number), cur) : null;
    const prevPt = valid.length > 30 ? valid[valid.length - 31].r : null;
    const cond = cur === null ? "Insufficient data" : cur >= 0.7 ? "Tightly coupled" : cur >= 0.4 ? "Moderately coupled" : "Loosely coupled";
    components.push({
      id: "correlation",
      name: "Correlation (BTC)",
      available: cur !== null,
      condition: cond,
      tone: cur === null ? "muted" : "neutral",
      value: cur !== null ? `ρ ${cur.toFixed(2)} (90D)` : "n/a",
      percentile: pct,
      basis: `rolling 90D correlation vs ${valid.length.toLocaleString("en-US")} observations`,
      trend: cur !== null && prevPt !== null ? (cur - prevPt > 0.05 ? "up" : cur - prevPt < -0.05 ? "down" : "flat") : null,
      trendNote: "vs 30 days ago",
      asOf: valid.length ? valid[valid.length - 1].t : null,
      detail: "Pearson correlation of daily log returns. Correlation does not imply causation.",
    });
  } else {
    components.push({
      id: "correlation",
      name: "Correlation (BTC)",
      available: false,
      condition: "BTC history unavailable",
      tone: "muted",
      value: "n/a",
      percentile: null,
      basis: "rolling 90D correlation",
      trend: null,
      trendNote: "",
      asOf: null,
      detail: "Requires BTC-USD daily history.",
    });
  }

  // 6) Regime & risk
  {
    const prevRisk = n > 227 ? computeRisk(xrp.slice(0, -7), computeRegime(xrp.slice(0, -7))) : null;
    const scoreOk = Number.isFinite(risk.score);
    components.push({
      id: "regime",
      name: "Regime & risk",
      available: regime.regime !== "UNKNOWN",
      condition: regime.regime === "UNKNOWN" ? "Insufficient data" : `${regime.regime} · ${risk.level} risk`,
      tone: regime.regime === "UNKNOWN" ? "muted" : risk.level === "HIGH" ? "warning" : risk.level === "ELEVATED" ? "caution" : risk.level === "LOW" ? "good" : "neutral",
      value: scoreOk ? `Risk score ${risk.score.toFixed(0)}/100` : "n/a",
      percentile: null,
      basis: `${regime.methodologyVersion} · weighted risk inputs`,
      trend: prevRisk && scoreOk && Number.isFinite(prevRisk.score) ? (risk.score - prevRisk.score > 3 ? "up" : risk.score - prevRisk.score < -3 ? "down" : "flat") : null,
      trendNote: "risk score vs 7 days ago",
      asOf: regime.asOf || null,
      detail: "Regime describes current conditions and does not predict direction; elevated risk ≠ a forecast of a decline.",
    });
  }

  // 7) Liquidity (live order book, if supplied)
  components.push(liquidityComponent(liveBook ?? null));
  components.push(notConnected("xrpl", "XRPL activity", "Network activity is measured in the XRPL module."));
  components.push(notConnected("flows", "Exchange flows", "Requires labelled exchange wallets (XRPL module)."));
  components.push(notConnected("concentration", "Concentration", "Requires holder-distribution data (XRPL module)."));

  return { components, regime, risk, asOf };
}

/** Liquidity component from a live order book (cheap — safe to recompute on every book update). */
export function liquidityComponent(liveBook: LiveBookInput | null): HealthComponent {
  if (!liveBook || liveBook.spreadPct === null)
    return notConnected("liquidity", "Liquidity", "Live order-book depth is shown on the Market page when the venue stream is connected.");
  const s = liveBook.spreadPct;
  return {
    id: "liquidity",
    name: "Liquidity (live book)",
    available: true,
    condition: s <= 0.05 ? "Tight spread" : s <= 0.2 ? "Normal spread" : "Wide spread",
    tone: s <= 0.2 ? "good" : "caution",
    value: `Spread ${s.toFixed(3)}%`,
    percentile: null,
    basis: `${liveBook.venue} top-of-book; no stored history → no percentile`,
    trend: null,
    trendNote: "",
    asOf: liveBook.asOf,
    detail:
      liveBook.depth1Pct !== null
        ? `Depth within ±1% of mid: ${Math.round(liveBook.depth1Pct).toLocaleString("en-US")} ${liveBook.quote} (visible levels only).`
        : "Visible order-book levels only.",
  };
}

function notConnected(id: HealthComponent["id"], name: string, detail: string): HealthComponent {
  return { id, name, available: false, condition: "Not connected", tone: "muted", value: "—", percentile: null, basis: "", trend: null, trendNote: "", asOf: null, detail };
}
