# XRP Terminal — Architecture & Build Contract

Authoritative product spec: `docs/SPEC.txt` (read the sections relevant to your module).
This file is the **engineering contract** every module must follow.

## Stack
- Next.js 15 App Router, React 19, TypeScript **strict** (TS 6). No `any` unless justified in a comment.
- Tailwind CSS 3 with design tokens (CSS variables in `src/app/globals.css`, Tailwind names in `tailwind.config.ts`).
- Charts: `src/components/charts/PriceChart.tsx` (TradingView Lightweight Charts v4 wrapper for candles/line/area + overlays + markers + price lines) and `src/components/charts/Charts.tsx` (Recharts 3 wrappers: `LineChart`, `BarChart`, `FanChart`), `Sparkline.tsx`.
- Validation: `zod` v4 (`import { z } from "zod"`; v3-style API `z.object`, `z.enum`, `z.coerce.number()` works).
- Decimal-safe money math: `decimal.js` (use in Trade Lab / portfolio ledgers).
- Icons: `lucide-react` v1 (no brand icons like Github/Twitter). Verify an icon exists: `node -e "console.log('Name' in require('lucide-react'))"`.
- Tests: `vitest` (`tests/**/*.test.ts`), run `npx vitest run`.
- Hosting: Netlify (`@netlify/plugin-nextjs`). Scheduled jobs = Netlify scheduled functions in `netlify/functions/*.mts` that call our `/api/jobs/*` routes with `CRON_SECRET`.
- Database/Auth: Supabase (Postgres + RLS). **Supabase is NOT configured in the first deployment** → every feature MUST work in *guest mode* (browser storage) and switch to Supabase persistence automatically when `isSupabaseConfigured()` and a user is signed in.

## Golden rules (from spec — non-negotiable)
1. **No fake data.** Never hard-code prices, wallets, transactions, users, traders, news, forecasts, performance. If a source is missing show `<NotConnected/>` / "Data source not connected." Development fixtures only inside `tests/`.
2. Every important data point carries **provenance** (`Provenance` type in `src/lib/types/market.ts`) and a visible freshness/source (`<DataFreshness/>`, `<SourceLine/>`).
3. Every async surface has **loading (skeleton), empty and error (with retry) states** (`src/components/ui/States.tsx`).
4. **Deterministic calculations in code**, never by AI. AI only explains (`src/lib/ai/anthropic.ts`).
5. Simulation is labelled **SIMULATED** (`<SimulatedBanner/>`, `<TrustBadge kind="SIMULATED"/>`). No real execution, deposits, withdrawals, custody. Never ask for seed phrases / private keys.
6. Forecasts are ranges with uncertainty, model version, timestamp; immutable once published.
7. No lookahead in backtests/replay/walk-forward. Indicators in `src/lib/analytics/indicators.ts` are causal (value[i] uses data[0..i]).
8. Mobile-first responsive. Test mentally at 375px. No horizontal page scroll (tables scroll inside their container).
9. Accessibility: semantic HTML, labels on inputs, focus states, `aria-*` where needed.
10. Plan limits via `src/lib/entitlements.ts` only (server-side enforcement in routes when Supabase configured).

## Directory layout
```
src/app/(marketing)/...        public site (landing, pricing, legal, auth) — indexed
src/app/(terminal)/...         terminal app (shell with sidebar/topbar/mobile nav) — noindex
src/app/api/<area>/...         route handlers (server). Use helpers in src/lib/server/api.ts
src/lib/<area>/...             pure logic (engines, calculations, providers) — unit-testable
src/components/ui/*            shared UI primitives (DO NOT fork; extend carefully)
src/components/charts/*        shared charts
src/components/<area>/*        feature components
src/components/widgets/*       dashboard widgets (see "Dashboard widget contract")
supabase/migrations/*.sql      schema + RLS (one file per area, see numbering)
tests/*.test.ts                vitest
```

## Existing building blocks (import, don't re-implement)
- Formatting: `src/lib/format.ts` → `formatPrice, formatMoney, formatSignedMoney, formatPct, formatNumber, formatCompact, formatCompactMoney, formatXrp, dropsToXrp, shortenMiddle, formatDateTime, formatDate, formatTime, formatAge, formatDuration, formatDays, rippleTimeToMs, currencySymbol`.
- Types: `src/lib/types/market.ts` → `Candle {t,o,h,l,c,v}`, `CandleSeries`, `Ticker`, `Provenance`, `DataStatus`, `ProviderHealth`, `ApiResult`, `Fiat`, `Timeframe`.
- Market data (server): `src/lib/providers/market/registry.ts` → `getTicker(pair)`, `getCandleSeries({pair,timeframe,limit|start,end})`, `getDailyHistory(pair)`, `getMarketProviderHealth()`. Providers: coinbase, kraken, bitstamp, binance (+ `snapshot.ts`: coingecko snapshot, ECB FX).
- Market API routes (exist): `GET /api/market/ticker?pair=XRP-USD`, `GET /api/market/candles?pair=XRP-USD&tf=1h&limit=300`, `GET /api/market/history?pair=XRP-USD|XRP-EUR|BTC-USD|ETH-USD` (full daily history since 2017 from one provider), `GET /api/market/snapshot?symbol=XRP`, `GET /api/market/fx`.
- Client hooks: `src/hooks/useApi.ts` (`useApi<T>(url,{refreshMs,staleMs})`, `apiGet`, `apiPost`, `ApiError`), `src/hooks/useMarketData.ts` (`useDailyHistory(pair)`, `useCandles(pair, tf, limit)`, `useTickerRest`, `useSnapshot`).
- Real-time: `useMarket()` from `src/components/providers/MarketProvider.tsx` → `{ ticker, status, venue, streaming, trades, fx, toDisplay(usd), currency, priceHistory }`. Only available inside the terminal layout.
- Preferences: `usePreferences()` → `{ prefs: {currency, timezone, theme, locale, ...}, setPref, tz }`.
- Auth: `useAuth()` → `{ enabled, loading, user, profile, isGuest, plan, signOut }`. Server: `getSupabaseServer()`, `getSupabaseAdmin()`, `getCurrentUser()`, `getCurrentRole()` in `src/lib/supabase/server.ts`. Browser: `getSupabaseBrowser()` (null if not configured).
- Notifications: `useNotifications().notify({category,title,body,href,dedupeKey,priority})`.
- Toasts: `useToast()({title, description, tone})`.
- Storage (guest mode): `readLocal/writeLocal/removeLocal` in `src/lib/storage/local.ts` (keys auto-prefixed `xrpt:`).
- XRPL: `src/lib/xrpl/client.ts` → `getXrplClient()` (browser singleton; `.request(command, params)`, `.subscribe({streams:[...]})`, `.onMessage(fn)`, `.onState(fn)`), `new XrplClient()` for server use. `src/lib/xrpl/address.ts` → `normalizeXrplAddress, isTxHash, isLedgerIndex, classifySearch, decodeCurrency`.
- Analytics: `src/lib/analytics/indicators.ts` (sma, ema, rsi, macd, bollinger, atr, vwap, logReturns, rollingVolatility, pearson, percentileRank, quantile, median, mean, stdev, alignByTime), `src/lib/analytics/regime.ts` (`computeRegime(daily)`, `computeRisk(daily, regime)`).
- AI: `src/lib/ai/anthropic.ts` → `callClaude({system, prompt, webSearch, maxTokens})`, `untrusted(label, text)`, `dataBlock(label, obj)`, `extractJson`, `verifiedUrls`, `AiNotConfiguredError`. Check `isAiConfigured()` from `src/lib/server/env.ts`.
- API helpers: `src/lib/server/api.ts` → `ok(data,{cacheSeconds})`, `fail(code,msg,status,retryable)`, `parseQuery(req, zodSchema)`, `parseBody(req, zodSchema)`, `limitOr429(req, scope, limit, windowMs)`, `log(level,msg,meta)`.
- UI: `Button, ButtonLink, buttonClass` · `Card, CardHeader, CardBody, CardFooter` · `Badge, TrustBadge` · `MetricCard, Delta, toneOf` · `Tabs` · `Modal, Drawer` · `DataTable (Column<T>)` · `Skeleton, SkeletonRows, EmptyState, ErrorState, NotConnected` · `DataFreshness, SourceLine` · `Tooltip, InfoTip, GLOSSARY` · `CopyButton, Hash, PageHeader, SimulatedBanner, Disclaimer, Field, Switch, Stat, ClaimLabel` (Misc.tsx). CSS classes: `card`, `card-pad`, `label`, `input`, `select`, `num` (tabular numbers), `grid-bg`, `text-gradient`, `accent-gradient`.
- Config: `src/lib/config.ts` → `SITE, isSupabaseConfigured, FEATURE_FLAGS, LEGAL_DISCLAIMER, INDEPENDENCE_STATEMENT, PAPER_DISCLAIMER`.
- Navigation: `src/lib/nav.ts` (routes that must exist).

## Design language
Premium dark fintech. Near-black graphite surfaces, restrained blue/cyan accent (`accent`), success/danger for direction only. Information-dense but calm. Use `card` panels with `CardHeader` titles (text-sm semibold), `label` micro-caps for metric labels, `num` for all numbers. Subtle motion only (`animate-fade-up`, hover transitions). No neon, no rockets/moons, no casino vibes. Never hard-code hex colors — use token classes (`text-fg`, `text-fg-secondary`, `text-fg-muted`, `bg-surface`, `border-border-subtle`, `text-accent`, `text-success`, `text-danger`, `text-warning`, `bg-accent/10` etc.).
Page skeleton:
```tsx
<PageHeader title="…" description="…" actions={…} />
<div className="grid gap-4 lg:grid-cols-12"> <Card className="lg:col-span-8">…</Card> … </div>
<Disclaimer short className="mt-6" />
```
Pages under `(terminal)` are client-heavy: put `"use client"` in feature components, keep `page.tsx` a small server component exporting `metadata` where useful.

## Supabase migrations (numbering — one owner each)
- `0000_foundation.sql` (exists): profiles, `is_admin()`, `set_updated_at()`, `prevent_mutation()`, audit_logs.
- `0010_platform.sql` — subscriptions, plans/entitlements, connected-account metadata shared, notifications, watchlists, feature flags, system_jobs, provider_health, admin moderation/reports, affiliate/referral, share_cards, data_snapshots, product analytics events.
- `0020_market_history.sql` — market_candles, market_metrics (+ regime snapshots).
- `0030_forecast.sql` — models registry, model changelog, forecasts (immutable), forecast_scenarios, forecast_actuals/evaluations.
- `0040_tradelab.sql` — paper_accounts, paper_events (immutable ledger), paper_orders, paper_fills, paper_positions, paper_trades, paper_journal, replay_sessions, strategies(+versions), backtests, backtest_trades, challenges.
- `0050_xrpl_portfolio.sql` — wallets, connected_accounts (encrypted exchange creds), wallet_labels (with provenance), xrpl cache tables, portfolio_lots, trader verification challenges.
- `0060_intel.sql` — news, news_sources, news_clusters, claims, claim_evidence, ai_briefs, ai_usage, alerts, alert_rules, alert_events, traders, trader_metrics, follows, social posts/reports.
Every user-owned table: `user_id uuid not null references public.profiles(id) on delete cascade`, RLS enabled, policies `user_id = auth.uid()` (+ `public.is_admin()` read where appropriate), indexes on (user_id, created_at). Public data tables: read for `anon, authenticated`, write only via service role. Immutable tables: trigger `prevent_mutation()`.

## Guest vs account persistence pattern
```ts
// src/lib/<area>/repo.ts
export interface XRepo { list(): Promise<X[]>; save(x: X): Promise<void>; remove(id: string): Promise<void>; }
export function getXRepo(userId: string | null): XRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  return sb ? supabaseXRepo(sb, userId!) : localXRepo();  // local = readLocal/writeLocal
}
```
Show `common.guestMode` notice ("Guest mode — data stored in this browser only") where user data is stored locally.

## Dashboard widget contract
Each module exports self-contained widgets from `src/components/widgets/<Name>.tsx` as **named exports**, `"use client"`, rendered inside a `Card`, handling their own loading/empty/error, compact height (~260–360px), linking to the full page via a "Open →" link in the CardHeader actions. Required names are listed in each module brief.

## API routes contract
- Validate every input with zod (`parseQuery`/`parseBody`). Rate-limit public/expensive endpoints (`limitOr429`).
- Return `ok(data)` / `fail(code, message, status)`. Never return stack traces.
- Protected routes: `getCurrentUser()`; return 401 if missing *when Supabase is configured*; ownership checks; entitlement checks via `src/lib/entitlements.ts`.
- Admin routes: `getCurrentRole()` must be `admin` (server-side).

## Definition of done for each module
- `npx tsc --noEmit` passes for your files, `npx vitest run` passes for your tests, pages render without runtime errors, no fake data, loading/empty/error states, mobile layout OK.
