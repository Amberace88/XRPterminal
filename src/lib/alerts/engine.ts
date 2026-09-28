import { EVENT_CONDITIONS, type AlertCondition, type AlertPriority, type AlertRule, type EvalContext } from "./types";

/**
 * Deterministic alert engine (spec §124–127). Pure functions — the same code runs in the
 * browser (AlertEngineMount) and in the server job (/api/jobs/alerts/check).
 *
 * Semantics
 * - Rules are AND-combinations of conditions (smart alerts, spec §125).
 * - Level conditions (price/volatility/volume/…) fire on the RISING EDGE (false → true).
 * - Event conditions (regime change, wallet tx, whale tx, news, forecast change) fire when
 *   the event is observed in the tick (and all other conditions hold).
 * Anti-spam (spec §127): per-rule cooldown, dedupe keys (24h), daily limit, aggregation of
 * bursts into one notification, and `critical` priority that bypasses aggregation and the
 * daily limit (but still respects dedupe and a 1-minute minimum cooldown).
 */

export const DEDUPE_WINDOW_MS = 24 * 3_600_000;
export const CRITICAL_MIN_COOLDOWN_MS = 60_000;

export interface ConditionResult {
  met: boolean;
  evaluable: boolean;
  detail: string;
  eventKey?: string;
}

const fmtUsd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 })}`;
const fmtXrp = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} XRP`;

export function describeCondition(c: AlertCondition): string {
  switch (c.type) {
    case "price_above":
      return `XRP price ≥ ${fmtUsd(c.value)}`;
    case "price_below":
      return `XRP price ≤ ${fmtUsd(c.value)}`;
    case "change_24h":
      return c.direction === "up" ? `24h change ≥ +${c.value}%` : c.direction === "down" ? `24h change ≤ −${c.value}%` : `24h move ≥ ±${c.value}%`;
    case "volatility_above":
      return `30D volatility ≥ ${c.value}% (annualized)`;
    case "volume_above":
      return `24h volume ≥ ${fmtUsd(c.value)}`;
    case "regime_change":
      return c.to === "ANY" ? "Market regime changes" : `Regime changes to ${c.to}`;
    case "wallet_activity":
      return `Wallet ${c.address.slice(0, 6)}…${c.address.slice(-4)} ${c.direction === "any" ? "sends/receives" : c.direction === "sent" ? "sends" : "receives"} ≥ ${fmtXrp(c.minXrp)}`;
    case "whale_tx":
      return `Whale transaction ≥ ${fmtXrp(c.minXrp)}`;
    case "news":
      return `News matching ${[...c.keywords.map((k) => `"${k}"`), ...c.categories].join(" / ") || "(nothing)"}`;
    case "forecast_change":
      return `Forecast range shifts ≥ ${c.minShiftPct}%`;
    case "portfolio_value":
      return `Portfolio value ${c.op === "above" ? "≥" : "≤"} ${fmtUsd(c.value)}`;
  }
}

export function evaluateCondition(c: AlertCondition, ctx: EvalContext): ConditionResult {
  const na = (why: string): ConditionResult => ({ met: false, evaluable: false, detail: why });
  switch (c.type) {
    case "price_above":
    case "price_below": {
      if (ctx.price === null || ctx.price === undefined) return na("price unavailable");
      const met = c.type === "price_above" ? ctx.price >= c.value : ctx.price <= c.value;
      return { met, evaluable: true, detail: `XRP ${fmtUsd(ctx.price)} ${c.type === "price_above" ? "≥" : "≤"} ${fmtUsd(c.value)}` };
    }
    case "change_24h": {
      const ch = ctx.changePct24h;
      if (ch === null || ch === undefined) return na("24h change unavailable");
      const met = c.direction === "up" ? ch >= c.value : c.direction === "down" ? ch <= -c.value : Math.abs(ch) >= c.value;
      return { met, evaluable: true, detail: `24h change ${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%` };
    }
    case "volatility_above": {
      if (ctx.vol30Pct === null || ctx.vol30Pct === undefined) return na("volatility unavailable");
      return { met: ctx.vol30Pct >= c.value, evaluable: true, detail: `30D volatility ${ctx.vol30Pct.toFixed(1)}%` };
    }
    case "volume_above": {
      if (ctx.volume24hQuote === null || ctx.volume24hQuote === undefined) return na("volume unavailable");
      return { met: ctx.volume24hQuote >= c.value, evaluable: true, detail: `24h volume ${fmtUsd(ctx.volume24hQuote)}` };
    }
    case "portfolio_value": {
      const v = ctx.portfolioValueUsd;
      if (v === null || v === undefined) return na("portfolio value unavailable");
      return { met: c.op === "above" ? v >= c.value : v <= c.value, evaluable: true, detail: `Portfolio ${fmtUsd(v)}` };
    }
    case "regime_change": {
      if (!ctx.regime || !ctx.prevRegime) return na("regime history unavailable");
      const changed = ctx.regime !== ctx.prevRegime && (c.to === "ANY" || ctx.regime === c.to);
      return { met: changed, evaluable: true, detail: `Regime ${ctx.prevRegime} → ${ctx.regime}`, eventKey: changed ? `regime:${ctx.prevRegime}->${ctx.regime}` : undefined };
    }
    case "wallet_activity": {
      if (!ctx.walletTxs) return na("wallet stream unavailable");
      const hits = ctx.walletTxs.filter((t) => {
        if (t.amountXrp < c.minXrp) return false;
        const sent = t.account === c.address;
        const recv = t.destination === c.address;
        return c.direction === "sent" ? sent : c.direction === "received" ? recv : sent || recv;
      });
      if (!hits.length) return { met: false, evaluable: true, detail: "no matching wallet transactions" };
      const total = hits.reduce((a, t) => a + t.amountXrp, 0);
      return { met: true, evaluable: true, detail: `${hits.length} tx, ${fmtXrp(total)} (${hits[0].hash.slice(0, 8)}…)`, eventKey: `tx:${hits.map((h) => h.hash).join(",")}` };
    }
    case "whale_tx": {
      if (!ctx.whaleTxs) return na("transaction stream unavailable");
      const hits = ctx.whaleTxs.filter((t) => t.amountXrp >= c.minXrp);
      if (!hits.length) return { met: false, evaluable: true, detail: "no whale transactions" };
      const top = [...hits].sort((a, b) => b.amountXrp - a.amountXrp)[0];
      return { met: true, evaluable: true, detail: `${hits.length} tx; largest ${fmtXrp(top.amountXrp)} (${top.hash.slice(0, 8)}…)`, eventKey: `whale:${hits.map((h) => h.hash).join(",")}` };
    }
    case "news": {
      if (!ctx.news) return na("news unavailable");
      const kws = c.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (!kws.length && !c.categories.length) return { met: false, evaluable: true, detail: "no keywords/categories set" };
      const hits = ctx.news.filter((n) => kws.some((k) => n.title.toLowerCase().includes(k)) || n.categories.some((cat) => c.categories.includes(cat)));
      if (!hits.length) return { met: false, evaluable: true, detail: "no matching stories" };
      return { met: true, evaluable: true, detail: `${hits.length} stor${hits.length === 1 ? "y" : "ies"}: ${hits[0].title.slice(0, 90)}`, eventKey: `news:${hits.map((h) => h.id).join(",")}` };
    }
    case "forecast_change": {
      const f = ctx.forecast;
      if (!f || !f.current || !f.previous) return na("forecast unavailable");
      const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2;
      const width = (r: { low: number; high: number }) => r.high - r.low;
      const midShift = Math.abs(mid(f.current) / mid(f.previous) - 1) * 100;
      const widthShift = width(f.previous) > 0 ? Math.abs(width(f.current) / width(f.previous) - 1) * 100 : 0;
      const shift = Math.max(midShift, widthShift);
      const met = shift >= c.minShiftPct;
      return { met, evaluable: true, detail: `Forecast range shifted ${shift.toFixed(1)}%`, eventKey: met ? `forecast:${f.current.low}-${f.current.high}` : undefined };
    }
  }
}

export interface RuleEvaluation {
  met: boolean;
  evaluable: boolean;
  hasEvent: boolean;
  details: string[];
  eventKey: string | null;
}

export function evaluateRule(rule: Pick<AlertRule, "conditions">, ctx: EvalContext): RuleEvaluation {
  const results = rule.conditions.map((c) => evaluateCondition(c, ctx));
  const evaluable = results.length > 0 && results.every((r) => r.evaluable);
  const met = evaluable && results.every((r) => r.met);
  const hasEvent = rule.conditions.some((c) => EVENT_CONDITIONS.includes(c.type));
  const keys = results.map((r) => r.eventKey).filter(Boolean) as string[];
  return { met, evaluable, hasEvent, details: results.map((r) => r.detail), eventKey: keys.length ? keys.join("|") : null };
}

/* ------------------------------ anti-spam ------------------------------ */

export interface EngineState {
  lastMet: Record<string, boolean>;
  lastFired: Record<string, number>;
  dedupe: Record<string, number>;
  day: string;
  dayCount: number;
}

export const initialEngineState = (): EngineState => ({ lastMet: {}, lastFired: {}, dedupe: {}, day: "", dayCount: 0 });

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type SuppressReason = "cooldown" | "duplicate" | "daily_limit";

export function gate(
  rule: Pick<AlertRule, "id" | "cooldownMin" | "priority">,
  dedupeKey: string,
  state: EngineState,
  now: number,
  dailyLimit: number,
): { allow: true } | { allow: false; reason: SuppressReason } {
  const seen = state.dedupe[dedupeKey];
  if (seen !== undefined && now - seen < DEDUPE_WINDOW_MS) return { allow: false, reason: "duplicate" };
  const cooldown = Math.max(0, rule.cooldownMin) * 60_000;
  const effCooldown = rule.priority === "critical" ? Math.min(cooldown, CRITICAL_MIN_COOLDOWN_MS) : cooldown;
  const last = state.lastFired[rule.id];
  if (last !== undefined && now - last < effCooldown) return { allow: false, reason: "cooldown" };
  const count = state.day === utcDay(now) ? state.dayCount : 0;
  if (rule.priority !== "critical" && count >= dailyLimit) return { allow: false, reason: "daily_limit" };
  return { allow: true };
}

export interface Firing {
  ruleId: string;
  ruleName: string;
  priority: AlertPriority;
  dedupeKey: string;
  details: string[];
  title: string;
  body: string;
}

export interface Notice {
  title: string;
  body: string;
  priority: AlertPriority;
  dedupeKey: string;
  ruleIds: string[];
  aggregated: boolean;
}

export interface TickResult {
  fired: Firing[];
  suppressed: { ruleId: string; reason: SuppressReason; dedupeKey: string }[];
  notices: Notice[];
  state: EngineState;
}

export function runTick(
  rules: AlertRule[],
  ctx: EvalContext,
  prev: EngineState,
  opts: { dailyLimit?: number; aggregateThreshold?: number } = {},
): TickResult {
  const dailyLimit = opts.dailyLimit ?? 50;
  const aggregateThreshold = opts.aggregateThreshold ?? 3;
  const now = ctx.now;
  const today = utcDay(now);
  const state: EngineState = {
    lastMet: { ...prev.lastMet },
    lastFired: { ...prev.lastFired },
    dedupe: Object.fromEntries(Object.entries(prev.dedupe).filter(([, t]) => now - t < DEDUPE_WINDOW_MS)),
    day: today,
    dayCount: prev.day === today ? prev.dayCount : 0,
  };
  const fired: Firing[] = [];
  const suppressed: TickResult["suppressed"] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.conditions.length) continue;
    const ev = evaluateRule(rule, ctx);
    if (!ev.evaluable) continue;
    const wasMet = state.lastMet[rule.id] ?? false;
    if (!ev.hasEvent) state.lastMet[rule.id] = ev.met;
    const trigger = ev.hasEvent ? ev.met : ev.met && !wasMet;
    if (!trigger) continue;
    const dedupeKey = `${rule.id}:${ev.eventKey ?? `level:${Math.floor(now / 60_000)}`}`;
    const g = gate(rule, dedupeKey, state, now, dailyLimit);
    if (!g.allow) {
      suppressed.push({ ruleId: rule.id, reason: g.reason, dedupeKey });
      continue;
    }
    state.dedupe[dedupeKey] = now;
    state.lastFired[rule.id] = now;
    state.dayCount++;
    fired.push({
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      dedupeKey,
      details: ev.details,
      title: rule.name,
      body: ev.details.join(" · "),
    });
  }
  return { fired, suppressed, notices: aggregate(fired, aggregateThreshold, now), state };
}

/** Bursts of non-critical alerts become one summary notification; critical alerts stay separate. */
export function aggregate(fired: Firing[], threshold: number, now: number): Notice[] {
  const critical = fired.filter((f) => f.priority === "critical");
  const rest = fired.filter((f) => f.priority !== "critical");
  const out: Notice[] = critical.map((f) => ({ title: f.title, body: f.body, priority: f.priority, dedupeKey: f.dedupeKey, ruleIds: [f.ruleId], aggregated: false }));
  if (rest.length > threshold) {
    out.push({
      title: `${rest.length} alerts triggered`,
      body: rest.map((f) => f.ruleName).join(", ").slice(0, 300),
      priority: "normal",
      dedupeKey: `agg:${now}`,
      ruleIds: rest.map((f) => f.ruleId),
      aggregated: true,
    });
  } else {
    for (const f of rest) out.push({ title: f.title, body: f.body, priority: f.priority, dedupeKey: f.dedupeKey, ruleIds: [f.ruleId], aggregated: false });
  }
  return out;
}
