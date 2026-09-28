/** Synthetic fixture candles for history/market tests. Test-only — never imported by app code. */
import type { Candle } from "@/lib/types/market";

export const DAY = 86_400_000;
export const T0 = Date.UTC(2017, 0, 1);

export function candlesFromCloses(closes: number[], t0 = T0, vol = 1000): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { t: t0 + i * DAY, o, h: Math.max(o, c) * 1.005, l: Math.min(o, c) * 0.995, c, v: vol };
  });
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian-ish random walk of log returns. */
export function randomWalk(n: number, seed = 1, sigma = 0.03, start = 1, drift = 0): number[] {
  const r = rng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) {
    const z = (r() + r() + r() + r() - 2) * Math.sqrt(3); // approx N(0,1)
    out.push(out[i - 1] * Math.exp(drift + sigma * z));
  }
  return out;
}

/** Piecewise geometric path through (dayIndex, price) knots. */
export function pathThrough(knots: [number, number][]): number[] {
  const out: number[] = [];
  for (let k = 0; k < knots.length - 1; k++) {
    const [d0, p0] = knots[k];
    const [d1, p1] = knots[k + 1];
    for (let d = d0; d < d1; d++) out.push(p0 * Math.pow(p1 / p0, (d - d0) / (d1 - d0)));
  }
  out.push(knots[knots.length - 1][1]);
  return out;
}
