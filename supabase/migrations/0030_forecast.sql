-- XRP Terminal — Future Intelligence (spec §55–67, §203–209)
-- Model registry, model changelog, immutable published forecasts and append-only evaluations.
-- Public data: readable by anon + authenticated; writes ONLY via the service role (cron jobs).
-- Immutability: prevent_mutation() (from 0000_foundation) blocks UPDATE / DELETE / TRUNCATE —
-- the trigger fires for the service role too, so a published forecast can never be overwritten.

-- ---------------------------------------------------------------------------
-- models (registry) — one row per model version (new version = new row)
-- ---------------------------------------------------------------------------
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  version text not null,
  purpose text not null,
  owner text not null,
  inputs jsonb not null default '[]'::jsonb,        -- features
  parameters jsonb not null default '{}'::jsonb,
  training_period text not null,
  evaluation text,                                   -- evaluation methodology / period
  limitations jsonb not null default '[]'::jsonb,
  status text not null default 'production' check (status in ('production','experimental','retired')),
  created_at timestamptz not null default now(),
  unique (model_name, version)
);
create trigger models_immutable before update or delete on public.models for each row execute function public.prevent_mutation();
create trigger models_no_truncate before truncate on public.models for each statement execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- model_changelog — append-only
-- ---------------------------------------------------------------------------
create table if not exists public.model_changelog (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  old_version text,
  new_version text not null,
  reason text not null,
  metrics jsonb not null default '{}'::jsonb,
  effective_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists model_changelog_model_idx on public.model_changelog (model_name, effective_date desc);
create trigger model_changelog_immutable before update or delete on public.model_changelog for each row execute function public.prevent_mutation();
create trigger model_changelog_no_truncate before truncate on public.model_changelog for each statement execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- forecasts — immutable published forecasts (spec §61, §205)
-- content_hash = sha256(identity: asset, horizon, as-of date, model, version) → idempotent publish
-- payload_hash = sha256(canonical JSON of the full content) → tamper evidence / reproducibility
-- ---------------------------------------------------------------------------
create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  asset text not null default 'XRP-USD',
  horizon_days integer not null check (horizon_days > 0),
  as_of timestamptz not null,                        -- open time (UTC) of the last completed daily candle used
  target_date date not null,
  created_at timestamptz not null default now(),
  model_name text not null,
  model_version text not null,
  inputs jsonb not null,
  scenarios jsonb not null,
  quantiles jsonb not null,
  uncertainty jsonb not null,
  assumptions jsonb not null,
  training_start date not null,
  training_end date not null,                        -- training cutoff (no data after this date used)
  data_provider text not null,
  content_hash text not null unique,
  payload_hash text not null,
  constraint forecasts_training_cutoff check (training_end <= (as_of at time zone 'UTC')::date),
  constraint forecasts_identity unique (asset, horizon_days, as_of, model_name, model_version),
  constraint forecasts_model_fk foreign key (model_name, model_version) references public.models (model_name, version)
);
create index if not exists forecasts_asset_h_asof_idx on public.forecasts (asset, horizon_days, as_of desc);
create index if not exists forecasts_target_idx on public.forecasts (target_date);
create trigger forecasts_immutable before update or delete on public.forecasts for each row execute function public.prevent_mutation();
create trigger forecasts_no_truncate before truncate on public.forecasts for each statement execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- forecast_evaluations — append-only, one per forecast (spec §63, §206)
-- ---------------------------------------------------------------------------
create table if not exists public.forecast_evaluations (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null unique references public.forecasts(id),
  evaluated_at timestamptz not null default now(),
  target_date date not null,
  actual_price double precision not null check (actual_price > 0),
  error double precision not null,                   -- P50 − actual
  abs_pct_error double precision not null,           -- |P50 − actual| / actual × 100
  in_p25_p75 boolean not null,
  in_p5_p95 boolean not null,
  direction_correct boolean,                         -- null when the median made no directional call
  model_version text not null,
  data_provider text not null
);
create index if not exists forecast_evaluations_target_idx on public.forecast_evaluations (target_date desc);
create trigger forecast_evaluations_immutable before update or delete on public.forecast_evaluations for each row execute function public.prevent_mutation();
create trigger forecast_evaluations_no_truncate before truncate on public.forecast_evaluations for each statement execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- forecast_scenarios — relational view over forecasts.scenarios (read-only)
-- ---------------------------------------------------------------------------
create or replace view public.forecast_scenarios with (security_invoker = true) as
select
  f.id as forecast_id,
  f.asset,
  f.horizon_days,
  f.as_of,
  f.model_name,
  f.model_version,
  s->>'kind' as scenario,
  s->>'band' as band,
  (s->'range'->>'low')::double precision as range_low,
  (s->'range'->>'high')::double precision as range_high,
  (s->>'pathShare')::double precision as path_share
from public.forecasts f
cross join lateral jsonb_array_elements(f.scenarios) as s;

-- ---------------------------------------------------------------------------
-- external_forecasts — third-party views, ALWAYS separate from our model (spec §67)
-- Written only by admins/service role after source verification. Not merged with internal model.
-- ---------------------------------------------------------------------------
create table if not exists public.external_forecasts (
  id uuid primary key default gen_random_uuid(),
  asset text not null default 'XRP-USD',
  source text not null,
  source_url text,
  author_entity text not null,
  published_date date not null,
  forecast_text text not null,
  target_low double precision,
  target_high double precision,
  target_date date,
  methodology text,
  created_at timestamptz not null default now()
);
create trigger external_forecasts_immutable before update or delete on public.external_forecasts for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- RLS: public read, no client writes (service role bypasses RLS)
-- ---------------------------------------------------------------------------
alter table public.models enable row level security;
alter table public.model_changelog enable row level security;
alter table public.forecasts enable row level security;
alter table public.forecast_evaluations enable row level security;
alter table public.external_forecasts enable row level security;

create policy "models: public read" on public.models for select to anon, authenticated using (true);
create policy "model_changelog: public read" on public.model_changelog for select to anon, authenticated using (true);
create policy "forecasts: public read" on public.forecasts for select to anon, authenticated using (true);
create policy "forecast_evaluations: public read" on public.forecast_evaluations for select to anon, authenticated using (true);
create policy "external_forecasts: public read" on public.external_forecasts for select to anon, authenticated using (true);

grant select on public.models, public.model_changelog, public.forecasts, public.forecast_evaluations, public.external_forecasts, public.forecast_scenarios to anon, authenticated;
revoke insert, update, delete on public.models, public.model_changelog, public.forecasts, public.forecast_evaluations, public.external_forecasts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: model registry + changelog (mirrors src/lib/forecast/registry.ts)
-- ---------------------------------------------------------------------------
insert into public.models (model_name, version, purpose, owner, inputs, parameters, training_period, evaluation, limitations)
values (
  'xrpt-scenario',
  '1.0.0',
  'Scenario ranges (BEAR/BASE/BULL/EXTREME) for XRP-USD terminal price at 7D–1Y horizons. Ranges, never point targets.',
  'XRP Terminal — Quant Research',
  '["Daily closes XRP-USD (single provider, completed UTC candles)","Trailing daily log returns (training window)","Current 30D realized volatility vs training-window volatility","Explanatory only: regime, 200D trend, BTC correlation, historical analogue"]'::jsonb,
  '{"method":"stationary block bootstrap","blockLength":10,"paths":4000,"evalPaths":600,"trainingWindowDays":1460,"volScaling":true,"volClamp":[0.5,2.0],"volDecayDays":30,"demeaned":true,"seedRule":"hash(model|version|asOfDate|horizon)"}'::jsonb,
  'Trailing 1460 daily returns ending at each as-of date (training cutoff = as-of date).',
  'Walk-forward: weekly as-of dates after a 365-day minimum window, fit on data <= as-of only; compared with naive persistence, 20D moving average, historical median and historical analogue baselines.',
  '["Cannot generate moves larger than those in its return sample; true tails may be wider.","No drift — does not forecast direction.","No fundamental, on-ledger, news, regulatory or liquidity inputs.","Non-stationarity: past calibration may not persist.","Horizons >= 3Y disabled: insufficient independent history."]'::jsonb
) on conflict (model_name, version) do nothing;

insert into public.model_changelog (model_name, old_version, new_version, reason, metrics, effective_date)
select 'xrpt-scenario', null, '1.0.0',
  'Initial release: stationary block bootstrap with volatility scaling and deterministic seeding.',
  '{"note":"Walk-forward metrics are computed live from the full history and shown on /future."}'::jsonb,
  date '2026-09-28'
where not exists (select 1 from public.model_changelog where model_name = 'xrpt-scenario' and new_version = '1.0.0');
