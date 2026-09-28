import type { Candle } from "@/lib/types/market";

/**
 * Portfolio valuation helpers. All "change" numbers are computed AT CURRENT HOLDINGS
 * (today's XRP amount × historical daily closes) — they are not the user's historical P&L.
 */

export interface TokenHolding {
  key: string;
  currency: string;
  issuer: string | null;
  amount: number;
  source: string; // account label
  /** Tokens are only valued when a reliable price exists — none is wired yet. */
  valued: false;
}

export interface AccountHolding {
  accountId: string;
  label: string;
  kind: "XRPL_WALLET" | "EXCHANGE_ACCOUNT";
  xrp: number;
  /** XRP locked by reserve (XRPL only) */
  reserveXrp?: number;
  tokens: TokenHolding[];
  error?: string | null;
  lastActivityMs?: number | null;
}

export function aggregateHoldings(accounts: AccountHolding[]): { xrp: number; tokens: TokenHolding[]; accountsOk: number; accountsFailed: number } {
  let xrp = 0;
  const tokens: TokenHolding[] = [];
  let ok = 0;
  let failed = 0;
  for (const a of accounts) {
    if (a.error) {
      failed++;
      continue;
    }
    ok++;
    xrp += a.xrp;
    tokens.push(...a.tokens);
  }
  return { xrp, tokens, accountsOk: ok, accountsFailed: failed };
}

/** Close price of the last candle at or before `t` (UTC ms). */
export function closeAt(candles: Candle[], t: number): { t: number; c: number } | null {
  let lo = 0;
  let hi = candles.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 ? { t: candles[best].t, c: candles[best].c } : null;
}

export interface PeriodChange {
  days: number;
  pastPrice: number;
  pastTime: number;
  changeValue: number;
  changePct: number;
}

/** Value change over `days` at current holdings, using the daily close ~days ago. */
export function periodChangeAtCurrentHoldings(candles: Candle[], holdingsXrp: number, currentPrice: number, days: number, now = Date.now()): PeriodChange | null {
  if (!candles.length || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const past = closeAt(candles, now - days * 86_400_000);
  if (!past || past.c <= 0) return null;
  // require the past candle to be reasonably close to the requested time (data gaps)
  if (now - days * 86_400_000 - past.t > 3 * 86_400_000) return null;
  return {
    days,
    pastPrice: past.c,
    pastTime: past.t,
    changeValue: holdingsXrp * (currentPrice - past.c),
    changePct: (currentPrice / past.c - 1) * 100,
  };
}

export function valueSeriesAtCurrentHoldings(candles: Candle[], holdingsXrp: number, days: number, now = Date.now()): { t: number; value: number }[] {
  const from = now - days * 86_400_000;
  return candles.filter((c) => c.t >= from).map((c) => ({ t: c.t, value: c.c * holdingsXrp }));
}

export interface WorstWindow {
  windowDays: number;
  returnPct: number;
  startT: number;
  endT: number;
}

/** Worst k-day close-to-close return in the history (k = 1, 7, 30…). Causal & deterministic. */
export function worstWindowReturn(candles: Candle[], k: number): WorstWindow | null {
  if (candles.length <= k) return null;
  let worst = Infinity;
  let at = -1;
  for (let i = 0; i + k < candles.length; i++) {
    const a = candles[i].c;
    const b = candles[i + k].c;
    if (!(a > 0) || !(b > 0)) continue;
    const r = b / a - 1;
    if (r < worst) {
      worst = r;
      at = i;
    }
  }
  if (at < 0) return null;
  return { windowDays: k, returnPct: worst * 100, startT: candles[at].t, endT: candles[at + k].t };
}

export function stressScenarios(candles: Candle[], portfolioValue: number, windows = [1, 7, 30]): (WorstWindow & { hypotheticalLoss: number; valueAfter: number })[] {
  return windows
    .map((k) => worstWindowReturn(candles, k))
    .filter((w): w is WorstWindow => w !== null)
    .map((w) => ({ ...w, hypotheticalLoss: (portfolioValue * w.returnPct) / 100, valueAfter: portfolioValue * (1 + w.returnPct / 100) }));
}
