/**
 * Trade journal + deterministic rule-based coach (spec §106, §107, §111, §216, §291).
 * The rule-based coach is pure code over the user's own SIMULATED trades and journal —
 * it always works, with or without an AI provider.
 */
import type { ClosedTrade } from "./types";

export const MISTAKE_TAGS = ["FOMO", "LATE_ENTRY", "EARLY_EXIT", "OVERSIZED", "GOOD_SETUP", "BAD_SETUP", "NO_STOP", "FOLLOWED_PLAN", "BROKE_PLAN"] as const;
export type MistakeTag = (typeof MISTAKE_TAGS)[number];
export const NEGATIVE_TAGS: string[] = ["FOMO", "LATE_ENTRY", "EARLY_EXIT", "OVERSIZED", "BAD_SETUP", "NO_STOP", "BROKE_PLAN"];
export const POSITIVE_TAGS: string[] = ["GOOD_SETUP", "FOLLOWED_PLAN"];
export const EMOTIONS = ["Calm", "Confident", "Focused", "Anxious", "Fearful", "Greedy", "Impatient", "Frustrated", "Bored", "Excited"] as const;
export const REGIME_OPTIONS = ["TRENDING UP", "TRENDING DOWN", "RANGE", "HIGH VOLATILITY", "LOW VOLATILITY", "TRANSITION", "UNKNOWN"] as const;

export interface JournalEntry {
  id: string;
  accountId: string;
  /** Closed trade (position) id, e.g. "p3". */
  tradeId: string;
  version: number;
  reasonForEntry: string;
  setup: string;
  regime: string;
  plannedRisk: number | null;
  plannedStop: number | null;
  plannedTarget: number | null;
  emotion: string;
  confidence: number | null;
  exitReason: string;
  lesson: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export function emptyJournal(id: string, accountId: string, trade: ClosedTrade, t: number): JournalEntry {
  return {
    id,
    accountId,
    tradeId: trade.id,
    version: trade.version,
    reasonForEntry: "",
    setup: "",
    regime: "",
    plannedRisk: trade.plannedRisk,
    plannedStop: trade.initialStop,
    plannedTarget: trade.initialTarget,
    emotion: "",
    confidence: null,
    exitReason: trade.exitRoles.includes("STOP_LOSS") ? "Stop-loss hit" : trade.exitRoles.includes("TAKE_PROFIT") ? "Take-profit hit" : "",
    lesson: "",
    tags: trade.initialStop === null ? ["NO_STOP"] : [],
    createdAt: t,
    updatedAt: t,
  };
}

export const normalizeTag = (t: string) =>
  t
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

export interface JournalRow {
  trade: ClosedTrade;
  entry: JournalEntry | null;
}

export interface JournalFilter {
  q?: string;
  setup?: string;
  tag?: string;
  regime?: string;
  result?: "all" | "win" | "loss";
  from?: number | null;
  to?: number | null;
  onlyWithLesson?: boolean;
  onlyMistakes?: boolean;
}

/** Search/filter journal rows by setup, tag, date, result, regime, mistake, lesson (spec §216). */
export function filterJournal(rows: JournalRow[], f: JournalFilter): JournalRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter(({ trade, entry }) => {
    if (f.result === "win" && !(trade.netPnl > 0)) return false;
    if (f.result === "loss" && !(trade.netPnl < 0)) return false;
    if (f.from && trade.closedAt < f.from) return false;
    if (f.to && trade.closedAt > f.to) return false;
    if (f.setup && (entry?.setup ?? "").toLowerCase() !== f.setup.toLowerCase()) return false;
    if (f.regime && (entry?.regime ?? "") !== f.regime) return false;
    if (f.tag && !(entry?.tags ?? []).includes(f.tag)) return false;
    if (f.onlyWithLesson && !entry?.lesson.trim()) return false;
    if (f.onlyMistakes && !(entry?.tags ?? []).some((t) => NEGATIVE_TAGS.includes(t))) return false;
    if (q) {
      const hay = [entry?.reasonForEntry, entry?.setup, entry?.lesson, entry?.exitReason, entry?.emotion, entry?.regime, ...(entry?.tags ?? []), trade.id].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface GroupStat {
  key: string;
  count: number;
  wins: number;
  winRate: number;
  netPnl: number;
  avgR: number | null;
}

function group(rows: JournalRow[], keyOf: (r: JournalRow) => string[]): GroupStat[] {
  const m = new Map<string, { count: number; wins: number; net: number; rs: number[] }>();
  for (const r of rows) {
    for (const k of keyOf(r)) {
      if (!k) continue;
      const g = m.get(k) ?? { count: 0, wins: 0, net: 0, rs: [] };
      g.count++;
      if (r.trade.netPnl > 0) g.wins++;
      g.net += r.trade.netPnl;
      if (r.trade.rMultiple !== null) g.rs.push(r.trade.rMultiple);
      m.set(k, g);
    }
  }
  return [...m.entries()]
    .map(([key, g]) => ({ key, count: g.count, wins: g.wins, winRate: (g.wins / g.count) * 100, netPnl: g.net, avgR: g.rs.length ? g.rs.reduce((a, b) => a + b, 0) / g.rs.length : null }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface RuleCoachSummary {
  trades: number;
  journaled: number;
  coveragePct: number | null;
  tagStats: GroupStat[];
  setupStats: GroupStat[];
  regimeStats: GroupStat[];
  emotionStats: GroupStat[];
  lossRateAfterFomo: number | null;
  noStopPct: number | null;
  riskCv: number | null;
  largestLossShare: number | null;
  top3LossShare: number | null;
  exitMix: { stopLoss: number; takeProfit: number; manual: number };
  avgConfidenceWins: number | null;
  avgConfidenceLosses: number | null;
  findings: { tone: "positive" | "neutral" | "warning"; text: string }[];
  questions: string[];
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Deterministic coaching summary. Never gives buy/sell instructions — only describes the user's own record. */
export function ruleBasedCoach(trades: ClosedTrade[], entries: JournalEntry[]): RuleCoachSummary {
  const byTrade = new Map(entries.map((e) => [e.tradeId, e]));
  const rows: JournalRow[] = trades.map((t) => ({ trade: t, entry: byTrade.get(t.id) ?? null }));
  const journaled = rows.filter((r) => r.entry).length;
  const tagStats = group(rows, (r) => r.entry?.tags ?? []);
  const setupStats = group(rows, (r) => [r.entry?.setup?.trim() ?? ""]);
  const regimeStats = group(rows, (r) => [r.entry?.regime ?? ""]);
  const emotionStats = group(rows, (r) => [r.entry?.emotion ?? ""]);
  const fomo = rows.filter((r) => r.entry?.tags.includes("FOMO"));
  const lossRateAfterFomo = fomo.length ? (fomo.filter((r) => r.trade.netPnl < 0).length / fomo.length) * 100 : null;
  const noStop = trades.filter((t) => t.initialStop === null).length;
  const risks = trades.map((t) => t.initialRisk).filter((x): x is number => x !== null && x > 0);
  const rMean = avg(risks);
  const riskCv = risks.length >= 3 && rMean ? Math.sqrt(risks.reduce((a, b) => a + (b - rMean) ** 2, 0) / (risks.length - 1)) / rMean : null;
  const losses = trades.map((t) => t.netPnl).filter((x) => x < 0).sort((a, b) => a - b);
  const totalLoss = -losses.reduce((a, b) => a + b, 0);
  const exitMix = {
    stopLoss: trades.filter((t) => t.exitRoles.includes("STOP_LOSS")).length,
    takeProfit: trades.filter((t) => t.exitRoles.includes("TAKE_PROFIT")).length,
    manual: trades.filter((t) => !t.exitRoles.includes("STOP_LOSS") && !t.exitRoles.includes("TAKE_PROFIT")).length,
  };
  const confW = rows.filter((r) => r.trade.netPnl > 0 && r.entry?.confidence).map((r) => r.entry!.confidence as number);
  const confL = rows.filter((r) => r.trade.netPnl < 0 && r.entry?.confidence).map((r) => r.entry!.confidence as number);

  const findings: RuleCoachSummary["findings"] = [];
  const questions: string[] = [];
  const n = trades.length;
  if (n === 0) {
    findings.push({ tone: "neutral", text: "No closed simulated trades yet. Complete a few trades and journal them to see patterns." });
  } else {
    if (n < 10) findings.push({ tone: "neutral", text: `Only ${n} closed trade(s) — patterns below are anecdotal until you have at least 10–20 trades.` });
    const cov = (journaled / n) * 100;
    if (cov < 80) findings.push({ tone: "warning", text: `${journaled} of ${n} trades are journaled (${cov.toFixed(0)}%). Unjournaled trades cannot be reviewed.` });
    if (noStop / n >= 0.3) findings.push({ tone: "warning", text: `${noStop} of ${n} trades (${((noStop / n) * 100).toFixed(0)}%) had no stop-loss, so their risk was undefined.` });
    else if (noStop === 0) findings.push({ tone: "positive", text: "Every trade had a defined stop-loss." });
    if (lossRateAfterFomo !== null && fomo.length >= 2) findings.push({ tone: lossRateAfterFomo >= 50 ? "warning" : "neutral", text: `Trades tagged FOMO: ${fomo.length}, of which ${lossRateAfterFomo.toFixed(0)}% lost money.` });
    const plan = tagStats.find((g) => g.key === "FOLLOWED_PLAN");
    const broke = tagStats.find((g) => g.key === "BROKE_PLAN");
    if (plan && broke) findings.push({ tone: "neutral", text: `Followed plan: ${plan.winRate.toFixed(0)}% win rate over ${plan.count} trades vs broke plan: ${broke.winRate.toFixed(0)}% over ${broke.count}.` });
    if (riskCv !== null) findings.push({ tone: riskCv > 0.75 ? "warning" : "positive", text: `Risk per trade varies with a coefficient of variation of ${riskCv.toFixed(2)} (${riskCv > 0.75 ? "inconsistent sizing" : "fairly consistent sizing"}).` });
    if (totalLoss > 0 && losses.length >= 3) {
      const share = (-losses[0] / totalLoss) * 100;
      if (share >= 40) findings.push({ tone: "warning", text: `Your largest loss accounts for ${share.toFixed(0)}% of all losses — risk is concentrated in one trade.` });
    }
    const bestSetup = setupStats.filter((g) => g.count >= 3).sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99))[0];
    if (bestSetup && bestSetup.avgR !== null) findings.push({ tone: "neutral", text: `Setup "${bestSetup.key}" has the highest average R (${bestSetup.avgR.toFixed(2)}R over ${bestSetup.count} trades) in your sample.` });
    const cw = avg(confW);
    const cl = avg(confL);
    if (cw !== null && cl !== null && confW.length >= 3 && confL.length >= 3) findings.push({ tone: "neutral", text: `Average confidence: ${cw.toFixed(1)} on winners vs ${cl.toFixed(1)} on losers.` });

    if (noStop > 0) questions.push("What made you skip a stop-loss on those trades, and what would the planned risk have been?");
    if (fomo.length) questions.push("What was happening in the market right before your FOMO entries?");
    if (exitMix.manual > exitMix.stopLoss + exitMix.takeProfit) questions.push("Most exits were manual — were they planned in advance or decided in the moment?");
    questions.push("Which of your setups would you keep if you could only trade one?");
    if (riskCv !== null && riskCv > 0.75) questions.push("How do you decide position size — is it the same rule every time?");
  }
  return {
    trades: n,
    journaled,
    coveragePct: n ? (journaled / n) * 100 : null,
    tagStats,
    setupStats,
    regimeStats,
    emotionStats,
    lossRateAfterFomo,
    noStopPct: n ? (noStop / n) * 100 : null,
    riskCv,
    largestLossShare: totalLoss > 0 && losses.length ? (-losses[0] / totalLoss) * 100 : null,
    top3LossShare: totalLoss > 0 && losses.length ? (-losses.slice(0, 3).reduce((a, b) => a + b, 0) / totalLoss) * 100 : null,
    exitMix,
    avgConfidenceWins: avg(confW),
    avgConfidenceLosses: avg(confL),
    findings,
    questions,
  };
}
