/**
 * Paper trading challenges (spec §119, §288). Progress is computed only from the
 * user's own SIMULATED data since the challenge was started. No rewards, no real money.
 */
import { drawdownDetail } from "./stats";
import type { JournalEntry } from "./journal";
import type { ReplaySession } from "./replay";
import type { ClosedTrade, EquityPoint } from "./types";

export type ChallengeId = "RISK_MANAGEMENT" | "REPLAY" | "DISCIPLINE_30D" | "LOW_DRAWDOWN";

export interface ChallengeDef {
  id: ChallengeId;
  title: string;
  summary: string;
  rules: string[];
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: "RISK_MANAGEMENT",
    title: "Risk Management Challenge",
    summary: "Close 10 simulated trades, each with a stop-loss and at most 1% of starting capital at risk.",
    rules: ["10 closed trades after you start", "Every trade has a stop-loss", "Initial risk (entry − stop) × size ≤ 1% of starting capital", "One violation fails the attempt — restart any time"],
  },
  {
    id: "REPLAY",
    title: "Historical Replay Challenge",
    summary: "Save 3 historical replay sessions with at least 5 trades each and a max drawdown of 15% or less.",
    rules: ["3 saved replay sessions after you start", "≥ 5 closed trades per session", "Session max drawdown ≤ 15%", "Future candles are hidden during replay"],
  },
  {
    id: "DISCIPLINE_30D",
    title: "30-Day Discipline Challenge",
    summary: "Trade for 30 days with a journal entry for ≥ 90% of trades and no single day losing more than 3% of starting capital.",
    rules: ["Runs 30 calendar days from the start", "≥ 10 closed trades", "Journal ≥ 90% of closed trades", "No UTC day with net closed-trade loss > 3% of starting capital"],
  },
  {
    id: "LOW_DRAWDOWN",
    title: "Low Drawdown Challenge",
    summary: "Complete 20 simulated trades while keeping the account's max drawdown at or below 5%.",
    rules: ["20 closed trades after you start", "Equity-curve max drawdown ≤ 5% since the start", "Exceeding 5% drawdown fails the attempt"],
  },
];

export interface ChallengeEnrollment {
  id: ChallengeId;
  startedAt: number;
  accountId: string | null;
}

export type ChallengeStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface ChallengeMetric {
  label: string;
  value: string;
  target: string;
  ok: boolean;
}

export interface ChallengeProgress {
  id: ChallengeId;
  status: ChallengeStatus;
  progressPct: number;
  metrics: ChallengeMetric[];
  note: string;
}

export interface ChallengeData {
  trades: ClosedTrade[];
  equityCurve: EquityPoint[];
  journal: JournalEntry[];
  replaySessions: ReplaySession[];
  startingCapital: number;
  now: number;
}

const pct = (x: number) => `${x.toFixed(1)}%`;

export function computeChallenge(id: ChallengeId, enr: ChallengeEnrollment | null, d: ChallengeData): ChallengeProgress {
  if (!enr) return { id, status: "NOT_STARTED", progressPct: 0, metrics: [], note: "Not started." };
  const trades = d.trades.filter((t) => t.closedAt >= enr.startedAt);
  switch (id) {
    case "RISK_MANAGEMENT": {
      const limit = d.startingCapital * 0.01;
      const violations = trades.filter((t) => t.initialStop === null || t.initialRisk === null || t.initialRisk > limit + 1e-9);
      const done = Math.min(10, trades.length);
      const failed = violations.length > 0;
      return {
        id,
        status: failed ? "FAILED" : trades.length >= 10 ? "COMPLETED" : "IN_PROGRESS",
        progressPct: (done / 10) * 100,
        metrics: [
          { label: "Closed trades", value: String(trades.length), target: "10", ok: trades.length >= 10 },
          { label: "Violations", value: String(violations.length), target: "0", ok: violations.length === 0 },
          { label: "Max allowed risk", value: `$${limit.toFixed(2)}`, target: "≤ 1% of capital", ok: true },
        ],
        note: failed ? `Trade ${violations[0].id} had ${violations[0].initialStop === null ? "no stop-loss" : "risk above 1%"}. Restart to try again.` : "Keep every trade's risk defined and small.",
      };
    }
    case "REPLAY": {
      const sessions = d.replaySessions.filter((s) => s.savedAt >= enr.startedAt);
      const ok = sessions.filter((s) => s.performance.trades >= 5 && s.performance.maxDrawdownPct <= 15);
      return {
        id,
        status: ok.length >= 3 ? "COMPLETED" : "IN_PROGRESS",
        progressPct: (Math.min(3, ok.length) / 3) * 100,
        metrics: [
          { label: "Qualifying sessions", value: String(ok.length), target: "3", ok: ok.length >= 3 },
          { label: "Saved sessions", value: String(sessions.length), target: "—", ok: true },
        ],
        note: "Sessions need ≥ 5 closed trades and ≤ 15% max drawdown.",
      };
    }
    case "DISCIPLINE_30D": {
      const days = Math.floor((d.now - enr.startedAt) / 86_400_000);
      const ids = new Set(d.journal.map((j) => j.tradeId));
      const journaled = trades.filter((t) => ids.has(t.id)).length;
      const coverage = trades.length ? (journaled / trades.length) * 100 : 0;
      const daily = new Map<number, number>();
      for (const t of trades) {
        const k = Math.floor(t.closedAt / 86_400_000);
        daily.set(k, (daily.get(k) ?? 0) + t.netPnl);
      }
      const worst = Math.min(0, ...daily.values());
      const worstPct = d.startingCapital > 0 ? (-worst / d.startingCapital) * 100 : 0;
      const failed = worstPct > 3;
      const complete = days >= 30 && trades.length >= 10 && coverage >= 90 && !failed;
      return {
        id,
        status: failed ? "FAILED" : complete ? "COMPLETED" : "IN_PROGRESS",
        progressPct: Math.min(100, (Math.min(30, days) / 30) * 50 + (Math.min(10, trades.length) / 10) * 25 + (Math.min(90, coverage) / 90) * 25),
        metrics: [
          { label: "Days elapsed", value: String(Math.min(days, 30)), target: "30", ok: days >= 30 },
          { label: "Closed trades", value: String(trades.length), target: "≥ 10", ok: trades.length >= 10 },
          { label: "Journal coverage", value: pct(coverage), target: "≥ 90%", ok: coverage >= 90 },
          { label: "Worst day", value: pct(worstPct), target: "≤ 3.0%", ok: !failed },
        ],
        note: failed ? "A single day lost more than 3% of starting capital." : "Consistency beats intensity: journal every trade.",
      };
    }
    case "LOW_DRAWDOWN": {
      const curve = d.equityCurve.filter((p) => p.t >= enr.startedAt);
      const dd = drawdownDetail(curve).maxDrawdownPct;
      const failed = dd > 5;
      return {
        id,
        status: failed ? "FAILED" : trades.length >= 20 ? "COMPLETED" : "IN_PROGRESS",
        progressPct: (Math.min(20, trades.length) / 20) * 100,
        metrics: [
          { label: "Closed trades", value: String(trades.length), target: "20", ok: trades.length >= 20 },
          { label: "Max drawdown", value: pct(dd), target: "≤ 5.0%", ok: !failed },
        ],
        note: failed ? "Drawdown exceeded 5%. Restart to try again." : "Size positions so a losing streak stays small.",
      };
    }
  }
}

/** Minimum sample for any public paper leaderboard entry (spec §120). */
export const LEADERBOARD_MIN_TRADES = 20;
export const LEADERBOARD_MIN_DAYS = 30;
