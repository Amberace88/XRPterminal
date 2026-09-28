/** Social intelligence / verified trader types (spec §82–87, §219–221, §290). */

export type VerificationStatus = "VERIFIED" | "UNVERIFIED" | "PENDING" | "REVOKED";

export interface TraderPrivacy {
  public_profile: boolean;
  public_pnl: boolean;
  public_positions: boolean;
  public_trades: boolean;
  public_history: boolean;
  public_wallet: boolean;
  anonymous_stats: boolean;
}

export const DEFAULT_PRIVACY: TraderPrivacy = {
  public_profile: false,
  public_pnl: false,
  public_positions: false,
  public_trades: false,
  public_history: false,
  public_wallet: false,
  anonymous_stats: true,
};

export const PRIVACY_LABELS: Record<keyof TraderPrivacy, { label: string; hint: string }> = {
  public_profile: { label: "Public profile", hint: "List me in the Verified Traders directory." },
  public_pnl: { label: "Public P&L", hint: "Show realized P&L and ROI on my profile." },
  public_positions: { label: "Public positions", hint: "Show currently open (unmatched) buys." },
  public_trades: { label: "Public trades", hint: "Show individual closed trades (enables simulated mimic)." },
  public_history: { label: "Public history", hint: "Show monthly performance history." },
  public_wallet: { label: "Public wallet", hint: "Show my verified XRPL address." },
  anonymous_stats: { label: "Anonymous statistics", hint: "Allow my metrics in aggregate stats without my name." },
};

export interface TraderMetrics {
  source: "XRPL_DEX" | "PAPER" | "EXCHANGE_READONLY";
  quoteAsset: string | null;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null; // 0..1
  totalPnl: number | null; // quote currency
  roiPct: number | null; // compounded per-trade returns, %
  profitFactor: number | null;
  avgReturnPct: number | null;
  stdevReturnPct: number | null;
  riskAdjusted: number | null; // mean/stdev of per-trade returns
  maxDrawdownPct: number | null;
  avgHoldingMs: number | null;
  consistency: number | null; // share of months with positive P&L, 0..1
  monthsCovered: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  eligible: boolean;
  ineligibleReason?: string;
  score: number | null; // composite leaderboard score 0..100 (never ROI-only)
  computedAt: number;
}

export interface PublicTrader {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  wallet: string | null; // only if public_wallet
  privacy: TraderPrivacy;
  metrics: TraderMetrics | null;
}

export interface ClosedTrade {
  entryTime: number;
  exitTime: number;
  qty: number; // base units (XRP)
  entryPrice: number; // quote per base
  exitPrice: number;
  pnl: number; // quote currency, before our simulated fees
  returnPct: number;
  holdingMs: number;
  exitHash?: string;
}
