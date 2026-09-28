/**
 * Deterministic scenario narratives (spec §56–60). Every sentence is generated from measured
 * inputs and model quantiles — no AI, no invented facts, no single price target.
 */
import { formatPct, formatPrice } from "@/lib/format";
import type { ForecastInputs, HorizonStatusKind, Quantiles, Scenario, ScenarioRange } from "./types";

const pct = (v: number, anchor: number) => (v / anchor - 1) * 100;
const range = (low: number, high: number, anchor: number): ScenarioRange => ({ low, high, lowPct: pct(low, anchor), highPct: pct(high, anchor) });
const f1 = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(d));
const volTxt = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(0)}%`);

export function modelAssumptions(horizonDays: number): string[] {
  return [
    `Future ${horizonDays}-day return sequences resemble re-sampled blocks (avg. 10 days) of the trailing 4-year return history.`,
    "No drift is extrapolated: historical returns are demeaned, so the central path is approximately flat. The model does not forecast direction.",
    "Near-term volatility starts at the current 30-day level (relative to the training window, clamped 0.5×–2×) and mean-reverts with a ~30-day time constant.",
    "Structural breaks, regulatory decisions, exchange/liquidity events and XRPL fundamentals are NOT model inputs.",
    "Anchor price is the last completed UTC daily close from a single data provider.",
  ];
}

export function modelLimitations(status: HorizonStatusKind, n: number, horizonDays: number): string[] {
  const out = [
    `Bootstrap sample: ${n} daily returns. Outcomes more extreme than anything in this sample cannot be generated — true tails may be wider.`,
    "Crypto return distributions are non-stationary; calibration measured in the past may not hold in the future.",
    "Ranges describe the distribution of simulated outcomes, not probabilities of events you can rely on.",
  ];
  if (status !== "enabled")
    out.unshift(`LOW SAMPLE: few independent ${horizonDays}-day windows exist in the available history, so the range and its calibration are weakly supported.`);
  return out;
}

function commonDrivers(i: ForecastInputs, horizonDays: number): string[] {
  const d: string[] = [];
  d.push(`Market regime at the as-of date: ${i.regime}.`);
  d.push(
    `30D realized volatility ${volTxt(i.vol30Ann)} annualized (${f1(i.volPercentile, 0)}th percentile of the training window) vs. ${volTxt(i.volTrainAnn)} over the training window → simulated volatility starts at ${i.volScaleApplied.toFixed(2)}× the historical level.`,
  );
  if (i.distFrom200Pct !== null)
    d.push(`Trend context: price is ${formatPct(i.distFrom200Pct, 1)} vs. its 200D average; 90D return ${formatPct(i.ret90Pct, 1)}. (Context only — trend is not extrapolated.)`);
  if (i.btcCorr90 !== null) d.push(`90D correlation with BTC daily returns: ${i.btcCorr90.toFixed(2)} — broad crypto-market moves are embedded in the resampled history.`);
  if (i.analogue && i.analogue.medianReturnPct !== null)
    d.push(
      `Historical analogue (${i.analogue.n} dates, ~${i.analogue.independentN} independent): median ${horizonDays}-day return ${formatPct(i.analogue.medianReturnPct, 1)}, middle 50% ${formatPct(i.analogue.p25ReturnPct, 1)} to ${formatPct(i.analogue.p75ReturnPct, 1)}.`,
    );
  return d;
}

function invalidation(i: ForecastInputs): string[] {
  const out = [
    `Regime change: the regime classification moves away from ${i.regime}${i.regime === "HIGH VOLATILITY" ? "" : " (e.g. to HIGH VOLATILITY)"}.`,
    i.volP90Ann !== null
      ? `Volatility shock: 30D realized volatility rises above ${volTxt(i.volP90Ann)} annualized (90th percentile of the training window).`
      : "Volatility shock: a sudden jump in realized volatility beyond its recent range.",
    i.btcCorr90 !== null
      ? `Correlation breakdown: the 90D XRP–BTC correlation (now ${i.btcCorr90.toFixed(2)}) falls below 0.20, i.e. XRP decouples from the market history the sample reflects.`
      : "Correlation breakdown: XRP decouples from the broad crypto market in a way not present in the history.",
    "Liquidity event: exchange outages, delistings or stablecoin disruptions that impair USD liquidity.",
    "Major external event: regulatory rulings, macro shocks or Ripple/XRPL-specific news producing moves outside the historical distribution.",
    "XRPL activity change: a structural shift in on-ledger activity (not a model input in v1.0.0).",
  ];
  return out;
}

export function buildScenarios(args: { quantiles: Quantiles; anchor: number; inputs: ForecastInputs; horizonDays: number; lowSample: boolean }): Scenario[] {
  const { quantiles: q, anchor, inputs: i, horizonDays: H, lowSample } = args;
  const drivers = commonDrivers(i, H);
  const inv = invalidation(i);
  const p = (v: number) => formatPrice(v, "USD");
  const lowNote = lowSample ? ["Low sample: few independent historical windows of this length — treat this range with extra caution."] : [];
  return [
    {
      kind: "BEAR",
      label: "Bear",
      band: "P5–P25",
      pathShare: 0.2,
      range: range(q.p05, q.p25, anchor),
      assumptions: [
        `Returns over the next ${H} days resemble the weaker 5–25% of re-sampled historical sequences at the current volatility scale.`,
        "No new information beyond what the return history already contains.",
      ],
      drivers,
      risks: [
        `A volatility shock or forced selling could carry the price below ${p(q.p05)} into the EXTREME lower tail.`,
        ...(i.btcCorr90 !== null && i.btcCorr90 > 0.5 ? ["High BTC correlation: a broad crypto drawdown would likely transmit to XRP."] : []),
        ...lowNote,
      ],
      invalidation: inv,
      lessApplicableIf: [
        `Price holds above the BASE upper bound (${p(q.p75)}) for a sustained period before the horizon ends.`,
        "The regime turns TRENDING UP while volatility normalises.",
        ...(i.volP10Ann !== null ? [`30D volatility compresses below ${volTxt(i.volP10Ann)} annualized, narrowing downside dispersion.`] : []),
      ],
    },
    {
      kind: "BASE",
      label: "Base",
      band: "P25–P75",
      pathShare: 0.5,
      range: range(q.p25, q.p75, anchor),
      assumptions: [
        `Returns resemble the middle half of re-sampled historical ${H}-day sequences.`,
        "Volatility gradually normalises toward its training-window level; no structural break.",
      ],
      drivers,
      risks: ["The middle 50% band is narrow relative to crypto tail risk — historically, half of outcomes fall outside it by construction.", ...lowNote],
      invalidation: inv,
      lessApplicableIf: [
        `Price leaves the ${p(q.p25)}–${p(q.p75)} corridor early in the horizon and stays out.`,
        i.volP90Ann !== null ? `Realized 30D volatility jumps above ${volTxt(i.volP90Ann)} annualized.` : "Realized volatility jumps well above its recent range.",
        "A regime change to HIGH VOLATILITY or a strong trend.",
      ],
    },
    {
      kind: "BULL",
      label: "Bull",
      band: "P75–P95",
      pathShare: 0.2,
      range: range(q.p75, q.p95, anchor),
      assumptions: [
        `Returns over the next ${H} days resemble the stronger 75–95% of re-sampled historical sequences.`,
        "Upside momentum comparable to past strong periods, without extrapolating the 2017 drift.",
      ],
      drivers,
      risks: [
        `Momentum-driven moves can overshoot above ${p(q.p95)} (EXTREME upper tail) or reverse sharply.`,
        "Upside that depends on a single event (e.g. a ruling or listing) is not modelled.",
        ...lowNote,
      ],
      invalidation: inv,
      lessApplicableIf: [
        `Price falls below the BASE lower bound (${p(q.p25)}) and stays there.`,
        "The regime turns TRENDING DOWN.",
        ...(i.btcCorr90 !== null && i.btcCorr90 > 0.5 ? ["BTC enters a drawdown while correlation remains high."] : []),
      ],
    },
    {
      kind: "EXTREME",
      label: "Extreme",
      band: "<P5 or >P95",
      pathShare: 0.1,
      range: range(q.p01, q.p99, anchor),
      tails: { lower: range(q.p01, q.p05, anchor), upper: range(q.p95, q.p99, anchor) },
      assumptions: [
        "Tail outcomes: comparable to the most extreme block sequences in the training history (5% of paths on each side).",
        "P1/P99 are shown as reference points, not bounds — real tails can be wider than any resampled history.",
      ],
      drivers: [...drivers, "Tail width is driven mainly by the volatility scale and the largest historical moves in the sample."],
      risks: ["Model cannot generate moves larger than the largest historical daily returns in its sample.", "Liquidity gaps or exchange events can produce discontinuous moves.", ...lowNote],
      invalidation: inv,
      lessApplicableIf: [
        i.volP10Ann !== null ? `Volatility compresses into the low range (< ${volTxt(i.volP10Ann)} annualized), making tail outcomes less likely within ${H} days.` : "Volatility compresses substantially.",
        "Tails never become impossible — they only become less likely.",
      ],
    },
  ];
}
