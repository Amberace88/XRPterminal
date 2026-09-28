import { formatCompactMoney, formatDate, formatDateTime, formatNumber, formatPct, formatPrice } from "@/lib/format";
import { sigmaRange } from "./metrics";
import type { BriefItem, BriefSection, DataBrief, IntelSnapshot, SourceRef } from "./types";

/**
 * Deterministic "data brief" (spec §69 daily, §70 weekly). Every item is built from
 * numbers computed in code + templated wording and labelled FACT / ANALYSIS / SCENARIO.
 * Missing inputs are stated as "Source unavailable." — never filled in.
 */

export const BRIEF_METHODOLOGY =
  "Built from structured internal data: live ticker and daily candles from our market-data providers, the deterministic regime/risk engines (regime-v1), realized volatility and return correlations computed in code, a sample of recent validated XRPL ledgers, and clustered news headlines from public RSS feeds. Wording is templated; no AI is involved in this data brief. FACT = directly measured or reported; ANALYSIS = rule-based interpretation; SCENARIO = conditional statistical range, not a prediction.";

const UNAVAILABLE = "Source unavailable.";

function fact(text: string, sources: SourceRef[] = []): BriefItem {
  return { kind: "FACT", text, sources };
}
function analysis(text: string, sources: SourceRef[] = []): BriefItem {
  return { kind: "ANALYSIS", text, sources };
}
function scenario(text: string, sources: SourceRef[] = []): BriefItem {
  return { kind: "SCENARIO", text, sources };
}
function unavailable(text = UNAVAILABLE, sources: SourceRef[] = []): BriefItem {
  return { kind: "UNAVAILABLE", text, sources };
}

function marketSrc(s: IntelSnapshot): SourceRef[] {
  const p = s.market.provenance;
  return p ? [{ label: p.source, provider: p.provider, timestamp: p.timestamp }] : [];
}
function historySrc(s: IntelSnapshot): SourceRef[] {
  const p = s.history.provenance;
  return p ? [{ label: `${p.source} (daily candles)`, provider: p.provider, timestamp: p.timestamp }] : [];
}
const engineSrc = (s: IntelSnapshot): SourceRef[] => [
  { label: `XRP Terminal regime/risk engine ${s.regime.methodologyVersion ?? ""}`.trim(), provider: "xrpterminal" },
  ...historySrc(s),
];
function xrplSrc(s: IntelSnapshot): SourceRef[] {
  return s.xrpl.server ? [{ label: `XRP Ledger public server ${s.xrpl.server}`, provider: "xrpl" }] : [];
}

const pct = (v: number | null, d = 2) => formatPct(v, d);
const px = (v: number | null) => formatPrice(v, "USD");

function marketSection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  if (s.market.available && s.market.price !== null) {
    items.push(fact(`XRP/USD last price ${px(s.market.price)} (${formatDateTime(s.market.provenance?.timestamp ?? s.asOf)}).`, marketSrc(s)));
    if (s.market.changePct24h !== null) items.push(fact(`24h change ${pct(s.market.changePct24h)}; 24h range ${px(s.market.low24h)} – ${px(s.market.high24h)}.`, marketSrc(s)));
    if (s.market.volume24hQuote !== null) items.push(fact(`24h venue volume ${formatCompactMoney(s.market.volume24hQuote)} (single venue, not market-wide).`, marketSrc(s)));
  } else items.push(unavailable(`Live price unavailable${s.market.error ? ` (${s.market.error})` : ""}. ${UNAVAILABLE}`));
  if (s.regime.current) items.push(fact(`Market regime: ${s.regime.current}. Risk level: ${s.risk.level ?? "n/a"}${s.risk.score !== null ? ` (${s.risk.score.toFixed(0)}/100)` : ""}.`, engineSrc(s)));
  return { id: "snapshot", n, title: "Market snapshot", items };
}

function changedSection(s: IntelSnapshot, n: number, weekly: boolean): BriefSection {
  const items: BriefItem[] = [];
  const r = s.returns;
  if (s.history.available) {
    items.push(fact(`Returns vs daily closes (UTC): 1D ${pct(r.d1)}, 7D ${pct(r.d7)}, 30D ${pct(r.d30)}${weekly ? `, 90D ${pct(r.d90)}` : ""}.`, [...marketSrc(s), ...historySrc(s)]));
    if (s.history.volume7vs30 !== null)
      items.push(fact(`Average daily volume over the last 7 days is ${s.history.volume7vs30.toFixed(2)}× the 30-day average.`, historySrc(s)));
  } else items.push(unavailable(`Daily history unavailable. ${UNAVAILABLE}`));
  if (s.regime.current && s.regime.previous) {
    items.push(
      s.regime.changed
        ? fact(`Regime changed from ${s.regime.previous} to ${s.regime.current} since ${weekly ? "7 days ago" : "the previous daily close"}.`, engineSrc(s))
        : fact(`Regime unchanged (${s.regime.current}) versus ${weekly ? "7 days ago" : "the previous daily close"}.`, engineSrc(s)),
    );
  }
  return { id: "changed", n, title: weekly ? "Weekly performance & regime change" : "What changed", items };
}

function whySection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  const c = s.correlation;
  if (c.btc30 !== null) {
    items.push(fact(`30D correlation of daily returns with BTC: ${c.btc30.toFixed(2)}${c.eth30 !== null ? `; with ETH: ${c.eth30.toFixed(2)}` : ""}.`, historySrc(s)));
    if (c.btcChange1d !== null && s.returns.d1 !== null)
      items.push(fact(`Over the last day BTC moved ${pct(c.btcChange1d)} vs XRP ${pct(s.returns.d1)}.`, [{ label: `BTC-USD daily candles (${c.provider ?? "provider"})`, provider: c.provider ?? undefined }]));
    const high = c.btc30 >= 0.7;
    const low = c.btc30 < 0.4;
    items.push(
      analysis(
        high
          ? "With high recent correlation, much of XRP's move is consistent with broad crypto-market direction. Correlation describes association, not causation."
          : low
            ? "Recent correlation with BTC is low, so XRP-specific factors may carry more weight in recent moves. Correlation describes association, not causation."
            : "Correlation with BTC is moderate: both market-wide and XRP-specific factors are plausibly involved. Correlation describes association, not causation.",
      ),
    );
  } else items.push(unavailable(`Cross-asset correlation unavailable. ${UNAVAILABLE}`));
  const xrpNews = s.news.clusters.length;
  if (s.news.available) {
    items.push(
      xrpNews
        ? analysis(`${xrpNews} XRP-related news stor${xrpNews === 1 ? "y was" : "ies were"} published in the last ${s.news.windowHours}h (see News). Headlines coinciding with a move do not establish that they caused it.`)
        : analysis(`No XRP-specific news stories found in the last ${s.news.windowHours}h in our sources.`),
    );
  }
  return { id: "why", n, title: "Why (measurable drivers)", items };
}

function xrplSection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  if (s.xrpl.available) {
    items.push(
      fact(
        `Latest validated ledger #${formatNumber(s.xrpl.validatedLedger, 0)}; ${s.xrpl.avgTxPerLedger !== null ? `average ${s.xrpl.avgTxPerLedger.toFixed(1)} transactions per ledger across the last ${s.xrpl.ledgersSampled} validated ledgers` : "transaction sample unavailable"}.`,
        xrplSrc(s),
      ),
    );
    if (s.xrpl.baseFeeXrp !== null) items.push(fact(`Base fee ${s.xrpl.baseFeeXrp} XRP; load factor ${s.xrpl.loadFactor ?? "n/a"}.`, xrplSrc(s)));
    items.push(analysis("A short ledger sample reflects the last few minutes only; see XRPL → Network activity for longer windows.", [{ label: "XRPL activity", url: "/xrpl/activity" }]));
  } else items.push(unavailable(`XRPL servers unreachable from the brief pipeline${s.xrpl.error ? ` (${s.xrpl.error})` : ""}. ${UNAVAILABLE}`));
  return { id: "xrpl", n, title: "XRPL activity", items };
}

function whaleSection(n: number): BriefSection {
  return {
    id: "whales",
    n,
    title: "Whale activity",
    items: [unavailable("Whale transfers are monitored live in the XRPL module; they are not aggregated into this brief. Source unavailable.", [{ label: "Live whale monitor", url: "/xrpl/whales" }])],
  };
}

function flowsSection(n: number): BriefSection {
  return {
    id: "flows",
    n,
    title: "Exchange flows",
    items: [unavailable("Exchange-flow attribution requires labelled exchange wallets and is not part of this brief. Source unavailable.", [{ label: "XRPL module", url: "/xrpl" }])],
  };
}

function newsSection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  if (!s.news.available) items.push(unavailable(`News sources unavailable${s.news.error ? ` (${s.news.error})` : ""}. ${UNAVAILABLE}`));
  else if (!s.news.clusters.length) items.push(fact(`No XRP-related stories in the last ${s.news.windowHours}h from ${s.news.sourcesHealthy}/${s.news.sourcesTotal} reachable sources.`));
  for (const c of s.news.clusters.slice(0, 6)) {
    items.push(
      fact(`${c.title} — ${c.sourceCount > 1 ? `reported by ${c.sourceCount} sources` : `single source (${c.source}), unverified`}; ${c.category}; ${formatDateTime(c.publishedAt)}.`, [
        { label: c.source, url: c.url, timestamp: c.publishedAt },
      ]),
    );
  }
  if (s.sentiment && s.sentiment.sampleSize > 0)
    items.push(
      analysis(
        `Headline tone (news-derived, lexicon method): ${s.sentiment.sufficient ? s.sentiment.label : "insufficient sample"} across ${s.sentiment.sampleSize} stories from ${s.sentiment.sourceCount} publishers. Not a price signal.`,
      ),
    );
  return { id: "news", n, title: "News", items };
}

function historicalSection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  const h = s.history;
  if (!h.available) return { id: "historical", n, title: "Historical context", items: [unavailable()] };
  if (h.athClose !== null)
    items.push(
      fact(
        `Highest daily close in the provider's history (since ${formatDate(h.firstDate)}): ${px(h.athClose)} on ${formatDate(h.athDate)}; current price is ${pct(h.pctFromAth, 1)} from it.`,
        historySrc(s),
      ),
    );
  if (h.high52w !== null) items.push(fact(`52-week range ${px(h.low52w)} – ${px(h.high52w)}.`, historySrc(s)));
  if (h.ret30Percentile !== null)
    items.push(fact(`The current 30-day return sits at the ${h.ret30Percentile.toFixed(0)}th percentile of all 30-day windows in the history.`, historySrc(s)));
  if (s.volatility.percentile !== null)
    items.push(fact(`30D realized volatility ${s.volatility.vol30Pct?.toFixed(0)}% (annualized) — ${s.volatility.percentile.toFixed(0)}th percentile of its history.`, historySrc(s)));
  items.push(analysis("Historical percentiles describe where current conditions sit relative to the past; they do not predict what comes next."));
  return { id: "historical", n, title: "Historical context", items };
}

function scenarioSection(s: IntelSnapshot, n: number, weekly: boolean): BriefSection {
  const items: BriefItem[] = [];
  const p = s.market.price ?? null;
  const vol = s.volatility.vol30Pct;
  if (p !== null && vol !== null) {
    for (const d of weekly ? [7, 30] : [1, 7]) {
      const r = sigmaRange(p, vol, d);
      items.push(
        scenario(`If volatility stays near its 30D level, a ±1σ ${d}-day move spans ${px(r.low)} – ${px(r.high)} (±${r.sigmaPct.toFixed(1)}%). Crypto returns are fat-tailed; moves outside this band are common.`, [
          ...marketSrc(s),
          ...historySrc(s),
        ]),
      );
    }
    items.push(analysis("These are statistical volatility bands, not forecasts. Model-based scenario ranges live in Future Intelligence.", [{ label: "Future Intelligence", url: "/future" }]));
  } else items.push(unavailable("Price or volatility unavailable — scenario bands not computed. Source unavailable."));
  if (weekly)
    items.push(unavailable("Forecast changes are tracked in Future Intelligence (forecast history); not aggregated here. Source unavailable.", [{ label: "Forecast history", url: "/future" }]));
  return { id: "scenarios", n, title: weekly ? "Scenarios & forecast changes" : "Future scenarios", items };
}

function riskSection(s: IntelSnapshot, n: number): BriefSection {
  const items: BriefItem[] = [];
  if (s.risk.level) {
    items.push(fact(`Risk level ${s.risk.level} (${s.risk.score?.toFixed(0)}/100).`, engineSrc(s)));
    for (const c of s.risk.topComponents) items.push(fact(`${c.name}: ${c.detail}.`, engineSrc(s)));
    items.push(analysis("Elevated risk describes current conditions (volatility, drawdown, regime, volume) — it is not a prediction of a decline."));
  } else items.push(unavailable("Risk engine needs ≥220 days of history. Source unavailable."));
  if (s.volatility.percentile !== null && s.volatility.percentile >= 80)
    items.push(analysis("Volatility is in the top quintile of its history; position sizing and stop distances are more sensitive than usual."));
  return { id: "risks", n, title: "Risks", items };
}

function watchSection(s: IntelSnapshot, n: number, weekly: boolean): BriefSection {
  const items: BriefItem[] = [];
  const p = s.market.price;
  if (p !== null && s.regime.sma50 !== null && s.regime.sma200 !== null) {
    items.push(
      analysis(
        `Price vs trend inputs: 50D SMA ${px(s.regime.sma50)} (${p > s.regime.sma50 ? "above" : "below"}), 200D SMA ${px(s.regime.sma200)} (${p > s.regime.sma200 ? "above" : "below"}). Crossings change the regime-engine inputs.`,
        engineSrc(s),
      ),
    );
  }
  if (s.volatility.percentile !== null)
    items.push(analysis(`Volatility percentile ${s.volatility.percentile.toFixed(0)} — the regime engine switches to HIGH VOLATILITY at ≥85.`, engineSrc(s)));
  if (s.history.high52w !== null && p !== null) items.push(analysis(`Distance to 52-week high: ${pct((s.history.high52w / p - 1) * 100, 1)}; to 52-week low: ${pct(((s.history.low52w ?? p) / p - 1) * 100, 1)}.`, historySrc(s)));
  const events = s.news.clusters.filter((c) => c.categories.some((k) => k === "REGULATION" || k === "INSTITUTIONAL" || k === "XRPL")).slice(0, 3);
  for (const e of events)
    items.push(
      fact(`Developing story: ${e.title} (${e.sourceCount > 1 ? `${e.sourceCount} sources` : "single source — unverified"}).`, [{ label: e.source, url: e.url, timestamp: e.publishedAt }]),
    );
  if (weekly) items.push(unavailable("Upcoming scheduled events: no verified event-calendar source is connected, so none are listed. Source unavailable."));
  if (!items.length) items.push(unavailable());
  return { id: "watch", n, title: weekly ? "What to watch & upcoming events" : "What to watch", items };
}

export function buildDataBrief(s: IntelSnapshot, now = Date.now()): DataBrief {
  const weekly = s.type === "weekly";
  const sections: BriefSection[] = [
    marketSection(s, 1),
    changedSection(s, 2, weekly),
    whySection(s, 3),
    xrplSection(s, 4),
    whaleSection(5),
    flowsSection(6),
    newsSection(s, 7),
    historicalSection(s, 8),
    scenarioSection(s, 9, weekly),
    riskSection(s, 10),
    watchSection(s, 11, weekly),
  ];
  const r = s.returns;
  const headline =
    s.market.price !== null
      ? `XRP ${px(s.market.price)} · ${weekly ? `7D ${pct(r.d7)}` : `24h ${pct(s.market.changePct24h ?? r.d1)}`} · ${s.regime.current ?? "regime n/a"} · risk ${s.risk.level ?? "n/a"}`
      : "Market data unavailable";
  return {
    type: s.type,
    title: weekly ? "Weekly XRP brief" : "Daily XRP brief",
    generatedAt: now,
    asOf: s.asOf,
    headline,
    sections,
    methodology: BRIEF_METHODOLOGY,
  };
}

/** Collect every URL referenced in a snapshot (the only URLs AI output may cite). */
export function allowedSourceUrls(s: IntelSnapshot): string[] {
  return s.news.clusters.map((c) => c.url);
}
