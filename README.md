# XRP Terminal — *See beyond the price.*

Independent XRP & XRP Ledger intelligence platform: live market data, XRPL explorer and wallet intelligence,
historical analytics, scenario ranges (not predictions), AI research with source control, news & claim check,
alerts, calculators and a fully **simulated** Trade Lab. Non-custodial by design.

> XRP Terminal is an independent software and analytics platform and is not affiliated with, endorsed by, or sponsored by Ripple Labs Inc.

## Modules
| Area | Route | Data |
|---|---|---|
| Dashboard (customizable command center) | `/dashboard` | all modules |
| Market (charts 1m–1M, indicators, order book, trades, market health) | `/market` | Coinbase · Kraken · Bitstamp · Binance (fallback chain), CoinGecko snapshot, ECB FX |
| XRPL explorer, account profiler, whales, activity, entity graph, RLUSD | `/xrpl/*` | public XRPL servers (xrplcluster, s1/s2.ripple.com, xrpl.ws), XRPScan well-known names |
| Portfolio (read-only wallets, cost basis FIFO/avg, stress tests, Binance read-only BETA) | `/portfolio` | XRPL, user lots |
| Historical intelligence (ATH, cycles, drawdowns, seasonality, correlation, analogues, stress) | `/historical` | daily history since 2017 (single provider per series) |
| Future intelligence (bootstrap scenario model, baselines, walk-forward, immutable history) | `/future` | model `xrpt-scenario` v1.0.0 |
| AI briefs, Ask, Claim Check | `/ai`, `/news/claim-check` | Anthropic (optional), deterministic data brief always |
| News | `/news` | publisher RSS (metadata + short excerpts only) |
| Social / verified traders (on-chain memo verification) | `/social` | Supabase + XRPL |
| Trade Lab (paper engine, journal, replay, strategy lab, challenges) | `/trade-lab/*` | live market data, virtual capital |
| Alerts, watchlist, calculators, research, academy, settings, admin | … | |

## Stack
Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind · Lightweight Charts · Recharts · Supabase (Postgres + Auth + RLS) · Stripe · Anthropic · Netlify (functions + scheduled functions) · Vitest.

## Getting started
```bash
npm install
cp .env.example .env.local   # every integration is optional
npm run dev                  # http://localhost:3000
npm test                     # 269 unit tests (engines, analytics, forecast integrity, backtest leakage…)
npm run typecheck && npm run build
```
Without Supabase the app runs in **guest mode** (per-browser storage). With Supabase configured, accounts, cloud persistence,
forecast history, verified traders and admin are enabled automatically.

## Database
Apply migrations in order from `supabase/migrations/` (`0000_foundation` → `0060_intel`). Every user-owned table has RLS;
public data is read-only for clients; forecasts, paper ledgers and audit logs are append-only.

## Honest status
- No fake data: when a provider or integration is missing the UI says "Data source not connected".
- Long-window XRPL analytics (24h–1Y network history, smart money) require a historical indexer — planned, shown as such.
- Legal texts must be reviewed by qualified counsel before commercial launch.

Docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) · spec [`docs/SPEC.txt`](docs/SPEC.txt)
