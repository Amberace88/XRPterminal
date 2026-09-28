-- XRP Terminal — market history (spec §20–26, §43–54, §157)
-- Public market data: readable by anon/authenticated, writable only by the service role (RLS bypass).
-- One provider per row; series are never stitched across providers.

-- ---------------------------------------------------------------------------
-- market_candles: validated OHLCV candles cached from exchange providers
-- ---------------------------------------------------------------------------
create table if not exists public.market_candles (
  id bigint generated always as identity primary key,
  asset text not null check (asset ~ '^[A-Z0-9]{2,10}$'),
  quote text not null check (quote ~ '^[A-Z0-9]{2,10}$'),
  timeframe text not null check (timeframe in ('1m','5m','15m','1h','4h','1D','1W','1M')),
  t timestamptz not null,                       -- candle open time (UTC)
  o numeric(38, 18) not null check (o > 0),
  h numeric(38, 18) not null check (h > 0),
  l numeric(38, 18) not null check (l > 0),
  c numeric(38, 18) not null check (c > 0),
  v numeric(38, 18) not null default 0 check (v >= 0),   -- base-asset volume
  provider text not null check (char_length(provider) between 2 and 32),
  source text,                                  -- human readable, e.g. 'Bitstamp XRP-USD'
  quality_flags text[] not null default '{}',   -- validation flags (spec §157)
  fetched_at timestamptz not null default now(),
  constraint market_candles_hl check (h >= l),          -- mirrors validateCandles(); other anomalies are flagged, not rejected
  constraint market_candles_unique unique (asset, quote, timeframe, t, provider)
);
create index if not exists market_candles_series_idx on public.market_candles (asset, quote, timeframe, provider, t desc);
create index if not exists market_candles_t_idx on public.market_candles (timeframe, t desc);
create index if not exists market_candles_fetched_idx on public.market_candles (fetched_at desc);

alter table public.market_candles enable row level security;
create policy "market_candles: public read" on public.market_candles for select to anon, authenticated using (true);
-- no insert/update/delete policies: writes only via service role (bypasses RLS)

-- ---------------------------------------------------------------------------
-- market_metrics: derived daily/rolling metrics (volatility, correlation, health components, …)
-- ---------------------------------------------------------------------------
create table if not exists public.market_metrics (
  id bigint generated always as identity primary key,
  asset text not null default 'XRP',
  quote text not null default 'USD',
  metric text not null check (char_length(metric) between 2 and 64),  -- e.g. 'vol30', 'corr90_btc', 'health.volatility'
  as_of timestamptz not null,                   -- data timestamp the metric refers to
  value numeric,
  percentile numeric check (percentile is null or (percentile >= 0 and percentile <= 100)),
  sample_size integer check (sample_size is null or sample_size >= 0),
  details jsonb not null default '{}'::jsonb,   -- inputs / condition / trend
  provider text not null,                       -- provider of the underlying series
  methodology_version text not null default 'v1',
  computed_at timestamptz not null default now(),
  constraint market_metrics_unique unique (asset, quote, metric, as_of, provider, methodology_version)
);
create index if not exists market_metrics_lookup_idx on public.market_metrics (asset, quote, metric, as_of desc);

alter table public.market_metrics enable row level security;
create policy "market_metrics: public read" on public.market_metrics for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- regime_snapshots: immutable daily regime & risk classifications (auditable history)
-- ---------------------------------------------------------------------------
create table if not exists public.regime_snapshots (
  id bigint generated always as identity primary key,
  asset text not null default 'XRP',
  quote text not null default 'USD',
  as_of timestamptz not null,                   -- daily candle the classification is based on
  regime text not null check (regime in ('TRENDING UP','TRENDING DOWN','RANGE','HIGH VOLATILITY','LOW VOLATILITY','TRANSITION','UNKNOWN')),
  risk_level text check (risk_level in ('LOW','MODERATE','ELEVATED','HIGH')),
  risk_score numeric check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  inputs jsonb not null default '[]'::jsonb,
  risk_components jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  explanation text,
  methodology_version text not null,
  provider text not null,
  created_at timestamptz not null default now(),
  constraint regime_snapshots_unique unique (asset, quote, as_of, provider, methodology_version)
);
create index if not exists regime_snapshots_asof_idx on public.regime_snapshots (asset, quote, as_of desc);

alter table public.regime_snapshots enable row level security;
create policy "regime_snapshots: public read" on public.regime_snapshots for select to anon, authenticated using (true);

-- snapshots are an audit trail: block UPDATE/DELETE even for privileged clients
drop trigger if exists regime_snapshots_immutable on public.regime_snapshots;
create trigger regime_snapshots_immutable before update or delete on public.regime_snapshots
  for each row execute function public.prevent_mutation();

grant select on public.market_candles, public.market_metrics, public.regime_snapshots to anon, authenticated;
