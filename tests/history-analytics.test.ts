import { describe, expect, it } from "vitest";
import { athAnalysis, drawdownSeries, drawdownStats, recoveryStats, summarize, swingDeclines, underwaterEpisodes, volBand, volatilityHistory } from "@/lib/analytics/history";
import { detectCycles, normalizeCycle, zigzag } from "@/lib/analytics/cycles";
import { MIN_DAYS_IN_MONTH, monthlyReturns, monthStats, SEASONALITY_MIN_N, weekdayStats, yearlyReturns } from "@/lib/analytics/seasonality";
import { alignedLogReturns, beta, correlationWindows, rollingCorrelation } from "@/lib/analytics/correlation";
import { analogueFeatures, findAnalogues } from "@/lib/analytics/analogues";
import { applyStress, buildStressScenarios, windowDecline, worstWindowDecline } from "@/lib/analytics/stress";
import { reactionZones, swingPivots } from "@/lib/analytics/zones";
import { candlesFromCloses, DAY, pathThrough, randomWalk, T0 } from "./history-fixtures";

describe("drawdown & ATH", () => {
  const closes = pathThrough([
    [0, 1],
    [10, 2], // ATH 2
    [20, 1], // -50%
    [30, 2.2], // new ATH (reclaimed at ~day 29)
    [40, 1.54], // -30% ongoing
  ]);
  const c = candlesFromCloses(closes);

  it("underwater series is causal and non-positive", () => {
    const dd = drawdownSeries(c);
    expect(dd.every((d) => d.dd <= 1e-9)).toBe(true);
    expect(dd[20].dd).toBeCloseTo(-50, 5);
    // truncating data does not change earlier values
    const dd2 = drawdownSeries(c.slice(0, 25));
    expect(dd2[20].dd).toBe(dd[20].dd);
  });

  it("ATH analysis reports dataset ATH, distance and last reclaim", () => {
    const a = athAnalysis(c)!;
    expect(a.athClose).toBeCloseTo(2.2, 6);
    expect(a.athCloseT).toBe(T0 + 30 * DAY);
    expect(a.daysSinceAth).toBe(10);
    expect(a.drawdownFromAthPct).toBeCloseTo(-30, 4);
    expect(a.distanceToAthPct).toBeCloseTo((2.2 / 1.54 - 1) * 100, 4);
    expect(a.lastReclaim?.peak).toBeCloseTo(2, 6);
    expect(a.lastReclaim?.depthPct).toBeCloseTo(-50, 4);
    expect(a.longestUnderwater?.ongoing).toBe(false);
  });

  it("underwater episodes include the ongoing one", () => {
    const eps = underwaterEpisodes(c, 20);
    expect(eps).toHaveLength(2);
    expect(eps[1].reclaimT).toBeNull();
    expect(eps[1].depthPct).toBeCloseTo(-30, 4);
  });

  it("swing declines, drawdown stats and recovery stats", () => {
    const eps = swingDeclines(c, 20);
    expect(eps.length).toBe(2);
    expect(eps[0].depthPct).toBeCloseTo(-50, 4);
    expect(eps[0].status).toBe("recovered");
    expect(eps[0].recoveryDays).toBeGreaterThan(0);
    expect(eps[1].status).toBe("ongoing");
    const st = drawdownStats(c, eps);
    expect(st.episodes).toBe(2);
    expect(st.depth.min).toBeCloseTo(-50, 4);
    expect(st.recoveredCount).toBe(1);
    expect(st.currentDrawdownPct).toBeCloseTo(-30, 4);
    const rs = recoveryStats(eps);
    expect(rs.days.n).toBe(1);
    expect(rs.censored).toBe(1);
    expect(rs.gainPct.mean).toBeCloseTo(100, 4);
  });

  it("summary statistics", () => {
    const s = summarize([3, 1, 2, 10]);
    expect(s).toMatchObject({ n: 4, min: 1, max: 10, median: 2.5, mean: 4 });
    expect(summarize([]).n).toBe(0);
  });

  it("volatility history and bands", () => {
    const v = volatilityHistory(candlesFromCloses(randomWalk(400, 7, 0.04)));
    expect(v.current30).not.toBeNull();
    expect(v.pct30).toBeGreaterThanOrEqual(0);
    expect(v.pct30).toBeLessThanOrEqual(100);
    expect(v.samples30).toBeGreaterThan(300);
    expect(volBand(10)).toBe("LOW");
    expect(volBand(50)).toBe("NORMAL");
    expect(volBand(80)).toBe("ELEVATED");
    expect(volBand(95)).toBe("EXTREME");
  });
});

describe("cycles", () => {
  // trough 1 → peak 10 → trough 3 (−70%) → peak 12 → trough 5 (−58%) → now 8
  const closes = pathThrough([
    [0, 1],
    [100, 10],
    [200, 3],
    [320, 12],
    [420, 5],
    [500, 8],
  ]);
  const c = candlesFromCloses(closes);

  it("zig-zag finds alternating pivots with thresholds", () => {
    const z = zigzag(c, 50, 100);
    // the final trough (5) is not confirmed: price never rallied +100% from it
    expect(z.pivots.map((p) => p.kind)).toEqual(["low", "high", "low", "high"]);
    expect(z.tentative?.kind).toBe("low");
    expect(z.pivots[1].price).toBeCloseTo(10, 6);
    // confirmation happens after the pivot (causal)
    expect(z.pivots.every((p) => p.confirmedAt > p.i)).toBe(true);
  });

  it("detects complete cycles and the current cycle", () => {
    const { cycles } = detectCycles(c, { declinePct: 50, rallyPct: 100 });
    expect(cycles).toHaveLength(2);
    const [c1, cur] = cycles;
    expect(c1.status).toBe("complete");
    expect(c1.returnPct).toBeCloseTo(900, 3);
    expect(c1.drawdownPct).toBeCloseTo(-70, 3);
    expect(c1.durationDays).toBe(200);
    expect(c1.recoveryDays).toBeGreaterThan(0); // 3 → regains 10 during the 2nd bull leg
    // current cycle starts at the last CONFIRMED trough (3), peak 12 confirmed, now 8
    expect(cur.status).toBe("current");
    expect(cur.startPrice).toBeCloseTo(3, 6);
    expect(cur.high).toBeCloseTo(12, 6);
    expect(cur.peakConfirmed).toBe(true);
    expect(cur.drawdownPct).toBeCloseTo((8 / 12 - 1) * 100, 4);
    expect(cur.durationDays).toBe(300);
    // with a looser rally threshold the trough at 5 is confirmed (+60%) and closes a 2nd complete cycle
    const loose = detectCycles(c, { declinePct: 50, rallyPct: 50 }).cycles;
    expect(loose).toHaveLength(3);
    expect(loose[1].recoveryDays).toBeNull(); // 12 never regained
    expect(loose[2].startPrice).toBeCloseTo(5, 6);
  });

  it("normalizes cycles to 100 at the anchor", () => {
    const { cycles } = detectCycles(c, { declinePct: 50, rallyPct: 100 });
    const pts = normalizeCycle(c, cycles[0], "trough");
    expect(pts[0].day).toBe(0);
    expect(pts[0].index).toBeCloseTo(100, 6);
    expect(pts[100].index).toBeCloseTo(1000, 3);
    const pk = normalizeCycle(c, cycles[0], "peak");
    expect(pk[0].index).toBeCloseTo(100, 6);
    expect(Math.min(...pk.map((p) => p.dd))).toBeCloseTo(-70, 3);
  });
});

describe("seasonality", () => {
  // 3 full years + partial current month
  const n = 365 * 3 + 20;
  const c = candlesFromCloses(randomWalk(n, 3, 0.02));
  const now = c[c.length - 1].t + DAY;

  it("counts N per calendar month over complete months only", () => {
    const months = monthlyReturns(c, now);
    const stats = monthStats(months);
    const total = stats.reduce((s, b) => s + b.n, 0);
    // first month has no previous close; last (partial) month excluded
    expect(total).toBe(months.filter((m) => m.complete).length);
    expect(months[months.length - 1].complete).toBe(false);
    expect(stats.every((b) => b.n <= 3)).toBe(true);
    expect(stats.every((b) => b.smallSample === b.n < SEASONALITY_MIN_N)).toBe(true);
    // Jan 2017 has no prior month → Jan has N = 2 (2018, 2019)
    expect(stats[0].n).toBe(2);
    expect(stats[1].n).toBe(3);
  });

  it("monthly return equals month-end close over previous month-end close", () => {
    const months = monthlyReturns(c, now);
    const feb17 = months.find((m) => m.year === 2017 && m.month === 1)!;
    const janEnd = c.filter((k) => new Date(k.t).getUTCMonth() === 0 && new Date(k.t).getUTCFullYear() === 2017).at(-1)!.c;
    const febEnd = c.filter((k) => new Date(k.t).getUTCMonth() === 1 && new Date(k.t).getUTCFullYear() === 2017).at(-1)!.c;
    expect(feb17.returnPct).toBeCloseTo((febEnd / janEnd - 1) * 100, 8);
    expect(feb17.days).toBeGreaterThanOrEqual(MIN_DAYS_IN_MONTH);
  });

  it("marks months with too few days as incomplete", () => {
    const gappy = c.filter((k) => !(new Date(k.t).getUTCFullYear() === 2018 && new Date(k.t).getUTCMonth() === 5 && new Date(k.t).getUTCDate() > 10));
    const jun = monthlyReturns(gappy, now).find((m) => m.year === 2018 && m.month === 5)!;
    expect(jun.complete).toBe(false);
  });

  it("weekday stats use consecutive days and sum to all returns", () => {
    const w = weekdayStats(c);
    expect(w.reduce((s, b) => s + b.n, 0)).toBe(c.length - 1);
    expect(w[0].label).toBe("Mon");
  });

  it("yearly returns flag the current year", () => {
    const y = yearlyReturns(c, now);
    expect(y.map((r) => r.year)).toEqual([2018, 2019, 2020]);
    expect(y[0].complete).toBe(true);
    expect(y[2].complete).toBe(false);
  });
});

describe("correlation", () => {
  const a = randomWalk(500, 11, 0.03);
  const noise = randomWalk(500, 12, 0.01);
  const b = a.map((x, i) => x * noise[i]); // highly correlated
  const ca = candlesFromCloses(a);
  const cb = candlesFromCloses(b);

  it("aligns only matching consecutive days", () => {
    const withGap = cb.filter((_, i) => i !== 100);
    const pairs = alignedLogReturns(ca, withGap);
    // day 100 and day 101 lose their pair
    expect(pairs.length).toBe(ca.length - 1 - 2);
  });

  it("window correlations report N and are strongly positive", () => {
    const pairs = alignedLogReturns(ca, cb);
    const w = correlationWindows(pairs, [30, 90, 180, 365]);
    expect(w.map((x) => x.n)).toEqual([30, 90, 180, 365]);
    w.forEach((x) => expect(x.r!).toBeGreaterThan(0.8));
    expect(pairs.length).toBe(499);
  });

  it("perfect correlation and beta", () => {
    const pairs = alignedLogReturns(ca, candlesFromCloses(a.map((x) => x ** 2)));
    expect(correlationWindows(pairs, [90])[0].r).toBeCloseTo(1, 8);
    expect(beta(pairs.map((p) => ({ t: p.t, a: p.b, b: p.a })))).toBeCloseTo(2, 8);
  });

  it("rolling correlation is causal", () => {
    const pairs = alignedLogReturns(ca, cb);
    const full = rollingCorrelation(pairs, 90);
    const part = rollingCorrelation(pairs.slice(0, 200), 90);
    expect(part[150].r).toBe(full[150].r);
    expect(full[50].r).toBeNull();
  });
});

describe("analogues", () => {
  const c = candlesFromCloses(randomWalk(1500, 21, 0.035));

  it("features are causal (no lookahead)", () => {
    const full = analogueFeatures(c);
    const part = analogueFeatures(c.slice(0, 900));
    expect(part[899]).toEqual(full[899]);
    expect(full[150]).toBeNull();
  });

  it("excludes the recent window and returns non-overlapping analogues", () => {
    const r = findAnalogues(c, { minGapDays: 180, separationDays: 90, top: 5 });
    const refT = c[c.length - 1].t;
    expect(r.analogues).toHaveLength(5);
    r.analogues.forEach((x) => expect(x.t).toBeLessThanOrEqual(refT - 180 * DAY));
    for (let i = 0; i < r.analogues.length; i++)
      for (let j = i + 1; j < r.analogues.length; j++) expect(Math.abs(r.analogues[i].t - r.analogues[j].t)).toBeGreaterThanOrEqual(90 * DAY);
    // sorted by similarity, bounded 0..100
    for (let i = 1; i < r.analogues.length; i++) expect(r.analogues[i].similarity).toBeLessThanOrEqual(r.analogues[i - 1].similarity);
    r.analogues.forEach((x) => {
      expect(x.similarity).toBeGreaterThan(0);
      expect(x.similarity).toBeLessThanOrEqual(100);
      expect(x.fwd90Pct).not.toBeNull();
    });
  });

  it("uses only data up to the reference date", () => {
    const ref = 1000;
    const a = findAnalogues(c, { referenceIndex: ref });
    const b = findAnalogues(c.slice(0, ref + 1));
    expect(a.analogues.map((x) => x.t)).toEqual(b.analogues.map((x) => x.t));
    expect(a.analogues.map((x) => x.fwd30Pct)).toEqual(b.analogues.map((x) => x.fwd30Pct));
  });

  it("finds an exact repeat as the top analogue", () => {
    const base = randomWalk(700, 5, 0.03);
    const seg = base.slice(300, 520);
    const scale = base[base.length - 1] / seg[0];
    // append an exact (scaled) copy so the latest state repeats day 519 of the base series
    const closes = [...base, ...seg.slice(1).map((x) => x * scale)];
    // ddAth differs because of running max; so only check the match is close in time to the copied origin
    const r = findAnalogues(candlesFromCloses(closes), { minGapDays: 180 });
    expect(r.analogues.length).toBeGreaterThan(0);
    expect(r.candidates).toBeGreaterThan(100);
  });
});

describe("stress testing", () => {
  const closes = pathThrough([
    [0, 1],
    [30, 2],
    [45, 1.2], // −40% within 15 days
    [100, 1.5],
  ]);
  const c = candlesFromCloses(closes);

  it("worst 30D window decline", () => {
    const w = worstWindowDecline(c, 30)!;
    expect(w.pct).toBeCloseTo(-40, 4);
    expect(w.peakT).toBe(T0 + 30 * DAY);
  });

  it("calendar-window decline requires coverage", () => {
    expect(windowDecline(c, Date.UTC(2018, 0, 1), Date.UTC(2018, 11, 31))).toBeNull();
    const d = windowDecline(c, T0, T0 + 60 * DAY)!;
    expect(d.pct).toBeCloseTo(-40, 4);
  });

  it("builds scenarios from data and applies them", () => {
    const long = candlesFromCloses(randomWalk(1400, 9, 0.04));
    const noise = randomWalk(1400, 10, 0.02);
    const btc = candlesFromCloses(long.map((k, i) => Math.sqrt(k.c) * noise[i]));
    const { scenarios } = buildStressScenarios(long, btc);
    const ids = scenarios.map((s) => s.id);
    expect(ids).toContain("xrp-worst-30d");
    expect(ids).toContain("bear-2018");
    expect(ids).toContain("covid-2020");
    expect(ids).toContain("vol-spike");
    scenarios.forEach((s) => expect(s.movePct).toBeLessThan(0));
    const o = applyStress(1000, -40, 500);
    expect(o).toMatchObject({ before: 1500, after: 1100, change: -400 });
    expect(o.changePct).toBeCloseTo(-26.6667, 3);
    expect(applyStress(1000, -150).after).toBe(0);
  });
});

describe("reaction zones", () => {
  it("clusters repeated swing highs/lows into zones", () => {
    // oscillate between ~1 and ~2 several times, end at 1.5
    const knots: [number, number][] = [];
    for (let k = 0; k < 8; k++) knots.push([k * 40, k % 2 === 0 ? 1 : 2]);
    knots.push([8 * 40, 1.5]);
    const c = candlesFromCloses(pathThrough(knots));
    expect(swingPivots(c, 5).length).toBeGreaterThan(4);
    const { zones } = reactionZones(c, { lookbackDays: 1000 });
    expect(zones.length).toBeGreaterThanOrEqual(2);
    const above = zones.find((z) => z.side === "above")!;
    const below = zones.find((z) => z.side === "below")!;
    expect(above.mid).toBeGreaterThan(1.8);
    expect(below.mid).toBeLessThan(1.1);
    expect(above.touches).toBeGreaterThanOrEqual(3);
  });
});
