/**
 * Historical reaction zones (spec §52). Statistical price areas where the market reacted in the past.
 * They are NOT guaranteed support or resistance.
 *
 * Methodology:
 * 1. Swing pivots: a daily high (low) that is the highest (lowest) of the surrounding ±`pivotSpan` days.
 *    Pivots need `pivotSpan` days on each side, so the most recent days cannot produce pivots.
 * 2. Pivot prices inside the lookback are clustered in log-space: a pivot joins a cluster if it lies within
 *    `tolerancePct` of the cluster's mean price. Each cluster becomes a zone (min…max of its pivots, widened
 *    to at least ±tolerance/2 around the mean).
 * 3. Volume-at-price: each candle's quote volume (base volume × typical price) is spread uniformly over the
 *    log-price bins its high–low range covers. A zone's volume share = volume in bins overlapping the zone.
 * 4. Score = touches (pivot count) weighted by recency, plus volume share. Zones are ranked by score and
 *    split into zones above / below the latest close.
 */
import type { Candle } from "@/lib/types/market";

export interface ReactionZone {
  low: number;
  high: number;
  mid: number;
  touches: number;
  highs: number;
  lows: number;
  lastTouchT: number;
  /** Share (0–100) of lookback quote volume traded inside the zone. */
  volumeSharePct: number;
  score: number;
  side: "above" | "below" | "inside";
  /** Distance from the latest close to the zone mid, %. */
  distancePct: number;
}

export interface ZoneParams {
  lookbackDays: number;
  pivotSpan: number;
  tolerancePct: number;
  maxZonesPerSide: number;
  bins: number;
}

export const DEFAULT_ZONE_PARAMS: ZoneParams = { lookbackDays: 730, pivotSpan: 5, tolerancePct: 4, maxZonesPerSide: 4, bins: 120 };

export function swingPivots(candles: Candle[], span: number): { i: number; t: number; price: number; kind: "high" | "low" }[] {
  const out: { i: number; t: number; price: number; kind: "high" | "low" }[] = [];
  for (let i = span; i < candles.length - span; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - span; j <= i + span; j++) {
      if (j === i) continue;
      // ties: the first of equal extremes is the pivot (strict on the left, non-strict on the right)
      if (j < i ? candles[j].h >= candles[i].h : candles[j].h > candles[i].h) isHigh = false;
      if (j < i ? candles[j].l <= candles[i].l : candles[j].l < candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ i, t: candles[i].t, price: candles[i].h, kind: "high" });
    if (isLow) out.push({ i, t: candles[i].t, price: candles[i].l, kind: "low" });
  }
  return out;
}

export function volumeProfile(candles: Candle[], bins: number): { lo: number; hi: number; edges: number[]; vol: number[]; total: number } | null {
  if (!candles.length) return null;
  const lo = Math.min(...candles.map((k) => k.l));
  const hi = Math.max(...candles.map((k) => k.h));
  if (!(lo > 0) || !(hi > lo)) return null;
  const llo = Math.log(lo);
  const step = (Math.log(hi) - llo) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => Math.exp(llo + i * step));
  const vol = new Array(bins).fill(0);
  let total = 0;
  for (const k of candles) {
    const qv = k.v * ((k.h + k.l + k.c) / 3);
    if (!(qv > 0)) continue;
    const a = Math.min(bins - 1, Math.max(0, Math.floor((Math.log(k.l) - llo) / step)));
    const b = Math.min(bins - 1, Math.max(0, Math.floor((Math.log(k.h) - llo) / step)));
    const share = qv / (b - a + 1);
    for (let x = a; x <= b; x++) vol[x] += share;
    total += qv;
  }
  return { lo, hi, edges, vol, total };
}

export function reactionZones(candles: Candle[], params: Partial<ZoneParams> = {}): { zones: ReactionZone[]; pivots: number; lookbackStart: number | null; lastClose: number | null } {
  const p = { ...DEFAULT_ZONE_PARAMS, ...params };
  if (candles.length < p.pivotSpan * 2 + 10) return { zones: [], pivots: 0, lookbackStart: null, lastClose: null };
  const window = candles.slice(-p.lookbackDays);
  const lastClose = window[window.length - 1].c;
  const lastT = window[window.length - 1].t;
  const piv = swingPivots(window, p.pivotSpan).sort((a, b) => a.price - b.price);
  const tol = p.tolerancePct / 100;

  // log-space greedy clustering on sorted prices
  const clusters: (typeof piv)[] = [];
  for (const pv of piv) {
    const cur = clusters[clusters.length - 1];
    if (cur) {
      const meanLog = cur.reduce((s, x) => s + Math.log(x.price), 0) / cur.length;
      if (Math.abs(Math.log(pv.price) - meanLog) <= Math.log(1 + tol)) {
        cur.push(pv);
        continue;
      }
    }
    clusters.push([pv]);
  }

  const vp = volumeProfile(window, p.bins);
  const spanMs = Math.max(1, lastT - window[0].t);
  const zones: ReactionZone[] = clusters
    .filter((c) => c.length >= 2)
    .map((c) => {
      const mid = Math.exp(c.reduce((s, x) => s + Math.log(x.price), 0) / c.length);
      const low = Math.min(Math.min(...c.map((x) => x.price)), mid * (1 - tol / 2));
      const high = Math.max(Math.max(...c.map((x) => x.price)), mid * (1 + tol / 2));
      let vs = 0;
      if (vp && vp.total > 0) {
        for (let b = 0; b < vp.vol.length; b++) {
          const e0 = vp.edges[b];
          const e1 = vp.edges[b + 1];
          const overlap = Math.max(0, Math.min(e1, high) - Math.max(e0, low));
          if (overlap > 0) vs += vp.vol[b] * (overlap / (e1 - e0));
        }
        vs = (vs / vp.total) * 100;
      }
      const recency = c.reduce((s, x) => s + 0.5 + 0.5 * ((x.t - window[0].t) / spanMs), 0);
      const side: ReactionZone["side"] = lastClose > high ? "below" : lastClose < low ? "above" : "inside";
      return {
        low,
        high,
        mid,
        touches: c.length,
        highs: c.filter((x) => x.kind === "high").length,
        lows: c.filter((x) => x.kind === "low").length,
        lastTouchT: Math.max(...c.map((x) => x.t)),
        volumeSharePct: vs,
        score: recency * 10 + vs,
        side,
        distancePct: (mid / lastClose - 1) * 100,
      };
    });

  const pick = (side: ReactionZone["side"]) =>
    zones
      .filter((z) => z.side === side)
      .sort((a, b) => b.score - a.score)
      .slice(0, p.maxZonesPerSide);
  const chosen = [...pick("above"), ...pick("inside").slice(0, 1), ...pick("below")].sort((a, b) => b.mid - a.mid);
  return { zones: chosen, pivots: piv.length, lookbackStart: window[0].t, lastClose };
}
