-- XRP Terminal — platform schema (0010)
-- subscriptions, plans + entitlements, notifications, feature flags, system jobs,
-- provider health, error events, share cards, data snapshots, product analytics,
-- affiliates/referrals, GDPR requests, Stripe webhook idempotency.
--
-- Conventions (docs/ARCHITECTURE.md):
--   * user-owned tables reference public.profiles(id) and have RLS "own rows" (+ admin read)
--   * public reference data: read for anon/authenticated, writes via service role only
--   * service-role writes bypass RLS (webhooks, cron, admin API after server-side role check)
--   * social_reports is owned by 0060_intel.sql and is NOT created here.

-- ---------------------------------------------------------------------------
-- plans + entitlements (seeded from src/lib/entitlements.ts PLANS)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key check (id in ('free','pro','proplus')),
  name text not null,
  price_eur_monthly numeric(10,2) not null check (price_eur_monthly >= 0),
  tagline text,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();

create table if not exists public.entitlements (
  plan_id text not null references public.plans(id) on delete cascade,
  key text not null,
  -- numeric limit (null = unlimited) or boolean feature flag
  value jsonb not null,
  kind text not null check (kind in ('limit','feature')),
  primary key (plan_id, key)
);

alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
create policy "plans: public read" on public.plans for select to anon, authenticated using (true);
create policy "entitlements: public read" on public.entitlements for select to anon, authenticated using (true);
create policy "plans: admin write" on public.plans for all using (public.is_admin()) with check (public.is_admin());
create policy "entitlements: admin write" on public.entitlements for all using (public.is_admin()) with check (public.is_admin());

insert into public.plans (id, name, price_eur_monthly, tagline, sort_order) values
  ('free', 'Free', 0, 'Real data, no card required.', 0),
  ('pro', 'Pro', 9.99, 'For active XRP market participants.', 1),
  ('proplus', 'Pro+', 19.99, 'Research-grade depth, no limits on accounts.', 2)
on conflict (id) do update set name = excluded.name, price_eur_monthly = excluded.price_eur_monthly, tagline = excluded.tagline, sort_order = excluded.sort_order;

insert into public.entitlements (plan_id, key, value, kind) values
  -- limits (null = unlimited)
  ('free','connectedAccounts','1','limit'), ('pro','connectedAccounts','5','limit'), ('proplus','connectedAccounts','null','limit'),
  ('free','alerts','5','limit'), ('pro','alerts','50','limit'), ('proplus','alerts','250','limit'),
  ('free','watchlistItems','15','limit'), ('pro','watchlistItems','100','limit'), ('proplus','watchlistItems','500','limit'),
  ('free','paperAccounts','1','limit'), ('pro','paperAccounts','5','limit'), ('proplus','paperAccounts','20','limit'),
  ('free','aiRequestsPerDay','5','limit'), ('pro','aiRequestsPerDay','60','limit'), ('proplus','aiRequestsPerDay','250','limit'),
  ('free','claimChecksPerDay','2','limit'), ('pro','claimChecksPerDay','20','limit'), ('proplus','claimChecksPerDay','100','limit'),
  ('free','backtestsPerDay','5','limit'), ('pro','backtestsPerDay','100','limit'), ('proplus','backtestsPerDay','1000','limit'),
  -- features
  ('free','advancedForecast','false','feature'), ('pro','advancedForecast','true','feature'), ('proplus','advancedForecast','true','feature'),
  ('free','longHorizonForecast','false','feature'), ('pro','longHorizonForecast','true','feature'), ('proplus','longHorizonForecast','true','feature'),
  ('free','advancedTradeLab','false','feature'), ('pro','advancedTradeLab','true','feature'), ('proplus','advancedTradeLab','true','feature'),
  ('free','strategyLab','true','feature'), ('pro','strategyLab','true','feature'), ('proplus','strategyLab','true','feature'),
  ('free','historicalReplay','true','feature'), ('pro','historicalReplay','true','feature'), ('proplus','historicalReplay','true','feature'),
  ('free','advancedAlerts','false','feature'), ('pro','advancedAlerts','true','feature'), ('proplus','advancedAlerts','true','feature'),
  ('free','smartAlerts','false','feature'), ('pro','smartAlerts','false','feature'), ('proplus','smartAlerts','true','feature'),
  ('free','entityGraph','false','feature'), ('pro','entityGraph','true','feature'), ('proplus','entityGraph','true','feature'),
  ('free','reports','false','feature'), ('pro','reports','true','feature'), ('proplus','reports','true','feature'),
  ('free','exchangeConnections','false','feature'), ('pro','exchangeConnections','true','feature'), ('proplus','exchangeConnections','true','feature')
on conflict (plan_id, key) do update set value = excluded.value, kind = excluded.kind;

-- ---------------------------------------------------------------------------
-- subscriptions (Stripe is the source of truth; rows written ONLY by the verified webhook)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  plan text check (plan in ('pro','proplus')),
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id, created_at desc);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
alter table public.subscriptions enable row level security;
create policy "subscriptions: read own or admin" on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
-- no insert/update/delete policies: service role only

-- Stripe webhook idempotency: each event id is processed once.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table public.stripe_events enable row level security;
create policy "stripe_events: admin read" on public.stripe_events for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- notifications (server-originated: security notices, alerts delivered by jobs)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('market','portfolio','wallet','news','forecast','tradelab','social','system','security','billing')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 2000),
  href text,
  priority text not null default 'normal' check (priority in ('low','normal','critical')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
-- full unique constraint (NULL dedupe keys never conflict) so PostgREST upserts can target it
alter table public.notifications add constraint notifications_user_dedupe_key unique (user_id, dedupe_key);
alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications: mark read own" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- feature flags (spec §241/§242/§339). Live trading bridge can never be enabled.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  status text not null check (status in ('PLANNED','IN DEVELOPMENT','BETA','LIVE','DISABLED')),
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint feature_flags_no_live_bridge check (key <> 'liveTradingBridge' or enabled = false)
);
create trigger feature_flags_updated_at before update on public.feature_flags for each row execute function public.set_updated_at();
alter table public.feature_flags enable row level security;
create policy "feature_flags: public read" on public.feature_flags for select to anon, authenticated using (true);
create policy "feature_flags: admin write" on public.feature_flags for update using (public.is_admin()) with check (public.is_admin());

insert into public.feature_flags (key, enabled, status, description) values
  ('exchangeConnections', true, 'BETA', 'Read-only exchange API connections'),
  ('entityGraph', true, 'BETA', 'XRPL entity graph'),
  ('socialIntelligence', true, 'BETA', 'Social intelligence & verified traders'),
  ('strategyLab', true, 'LIVE', 'Strategy Lab backtesting'),
  ('liveTradingBridge', false, 'DISABLED', 'Future real-trading bridge — never enabled in MVP'),
  ('experimentalForecasts', false, 'PLANNED', 'Experimental forecast models')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- system jobs (spec §238) + provider health (spec §153) + error events (spec §147/§152)
-- ---------------------------------------------------------------------------
create table if not exists public.system_jobs (
  name text primary key check (name ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  description text,
  schedule text,
  last_run timestamptz,
  next_run timestamptz,
  duration_ms int,
  status text not null default 'never_run' check (status in ('never_run','running','success','failed','skipped')),
  run_count int not null default 0,
  error_count int not null default 0,
  last_error text,
  safe_to_retry boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger system_jobs_updated_at before update on public.system_jobs for each row execute function public.set_updated_at();
alter table public.system_jobs enable row level security;
create policy "system_jobs: admin read" on public.system_jobs for select using (public.is_admin());

create table if not exists public.provider_health (
  id text primary key,
  name text not null,
  kind text not null,
  status text not null check (status in ('HEALTHY','DEGRADED','DOWN','UNKNOWN')),
  latency_ms int,
  last_success timestamptz,
  last_failure timestamptz,
  message text,
  checked_at timestamptz not null default now()
);
alter table public.provider_health enable row level security;
create policy "provider_health: admin read" on public.provider_health for select using (public.is_admin());

create table if not exists public.error_events (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null check (source in ('client','server','job','webhook')),
  message text not null check (char_length(message) <= 1000),
  path text,
  digest text,
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists error_events_last_seen_idx on public.error_events(last_seen desc);
alter table public.error_events enable row level security;
create policy "error_events: admin read" on public.error_events for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- share cards (spec §132) & data snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.share_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('performance','historical','scenario','portfolio','tradelab','research')),
  title text not null check (char_length(title) <= 140),
  payload jsonb not null,
  data_source text not null,
  data_timestamp timestamptz not null,
  simulated boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists share_cards_user_idx on public.share_cards(user_id, created_at desc);
alter table public.share_cards enable row level security;
create policy "share_cards: read own, public or admin" on public.share_cards for select using (is_public or user_id = auth.uid() or public.is_admin());
create policy "share_cards: insert own" on public.share_cards for insert with check (user_id = auth.uid());
create policy "share_cards: update own" on public.share_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "share_cards: delete own" on public.share_cards for delete using (user_id = auth.uid());

create table if not exists public.data_snapshots (
  id bigint generated always as identity primary key,
  kind text not null,
  key text not null,
  payload jsonb not null,
  provenance jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists data_snapshots_kind_idx on public.data_snapshots(kind, key, created_at desc);
alter table public.data_snapshots enable row level security;
create policy "data_snapshots: public read" on public.data_snapshots for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- product analytics (spec §327) — minimal props, no sensitive data
-- ---------------------------------------------------------------------------
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (name in (
    'signup','onboarding_complete','wallet_connected','portfolio_view','future_view','trade_lab_started',
    'paper_trade','strategy_created','alert_created','subscription_started','subscription_cancelled',
    'academy_module_completed','checkout_started','page_view'
  )),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048),
  created_at timestamptz not null default now()
);
create index if not exists product_events_name_idx on public.product_events(name, created_at desc);
create index if not exists product_events_user_idx on public.product_events(user_id, created_at desc);
alter table public.product_events enable row level security;
create policy "product_events: admin read" on public.product_events for select using (public.is_admin());
-- inserts go through /api/user/events (service role) after consent + validation

-- ---------------------------------------------------------------------------
-- affiliates & referrals (spec §139/§140) — never fabricate conversions
-- ---------------------------------------------------------------------------
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  referral_code text not null unique,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  commission_rate numeric(5,4) not null default 0 check (commission_rate >= 0 and commission_rate <= 0.5),
  payout_email text,
  created_at timestamptz not null default now()
);
alter table public.affiliates enable row level security;
create policy "affiliates: read own or admin" on public.affiliates for select using (user_id = auth.uid() or public.is_admin());
create policy "affiliates: admin write" on public.affiliates for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.referral_clicks (
  id bigint generated always as identity primary key,
  referral_code text not null,
  ip_hash text not null,
  ua_hash text,
  landing_path text,
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);
create index if not exists referral_clicks_code_idx on public.referral_clicks(referral_code, created_at desc);
create index if not exists referral_clicks_ip_idx on public.referral_clicks(ip_hash, created_at desc);
alter table public.referral_clicks enable row level security;
create policy "referral_clicks: referrer or admin read" on public.referral_clicks for select using (
  public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.referral_code = referral_clicks.referral_code)
);

create table if not exists public.referral_conversions (
  id bigint generated always as identity primary key,
  referral_code text not null,
  referred_user_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in ('signup','qualified','paid')),
  amount numeric(12,2),
  currency text,
  commission numeric(12,2),
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  fraud_flags text[] not null default '{}',
  stripe_reference text,
  created_at timestamptz not null default now(),
  unique (referred_user_id, event)
);
create index if not exists referral_conversions_code_idx on public.referral_conversions(referral_code, created_at desc);
alter table public.referral_conversions enable row level security;
create policy "referral_conversions: referrer or admin read" on public.referral_conversions for select using (
  public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.referral_code = referral_conversions.referral_code)
);

-- Record a signup conversion when a new profile carries a valid referral code.
-- Self-referral and unknown codes are rejected (fraud protection, spec §140).
create or replace function public.record_referral_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare referrer uuid;
begin
  if new.referred_by is null or new.referred_by = '' then return new; end if;
  select id into referrer from public.profiles where referral_code = new.referred_by and id <> new.id limit 1;
  if referrer is null then
    return new; -- unknown code or self-referral: no conversion is recorded
  end if;
  insert into public.referral_conversions (referral_code, referred_user_id, event)
  values (new.referred_by, new.id, 'signup')
  on conflict (referred_user_id, event) do nothing;
  return new;
end $$;
-- AFTER INSERT: the new profile row exists, so the FK on referred_user_id is satisfied.
drop trigger if exists profiles_referral_signup on public.profiles;
create trigger profiles_referral_signup after insert on public.profiles for each row execute function public.record_referral_signup();

-- ---------------------------------------------------------------------------
-- GDPR requests (spec §195) — kept (anonymised) after account deletion as proof of compliance
-- ---------------------------------------------------------------------------
create table if not exists public.gdpr_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email_hash text,
  kind text not null check (kind in ('export','delete','rectify','restrict')),
  status text not null default 'received' check (status in ('received','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);
create index if not exists gdpr_requests_user_idx on public.gdpr_requests(user_id, requested_at desc);
alter table public.gdpr_requests enable row level security;
create policy "gdpr_requests: read own or admin" on public.gdpr_requests for select using (user_id = auth.uid() or public.is_admin());
create policy "gdpr_requests: insert own export" on public.gdpr_requests for insert with check (user_id = auth.uid() and kind = 'export');

-- ---------------------------------------------------------------------------
-- helper functions for server code (service role only)
-- ---------------------------------------------------------------------------
-- Upsert an error event, counting repeats (used by src/lib/admin/errors.ts).
create or replace function public.record_error_event(
  p_fingerprint text, p_source text, p_message text, p_path text, p_digest text, p_metadata jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.error_events (fingerprint, source, message, path, digest, metadata)
  values (p_fingerprint, p_source, left(p_message, 1000), p_path, p_digest, coalesce(p_metadata, '{}'::jsonb))
  on conflict (fingerprint) do update
    set count = public.error_events.count + 1, last_seen = now(), digest = coalesce(excluded.digest, public.error_events.digest);
$$;

-- Record a scheduled job run (used by /api/jobs/* handlers via src/lib/admin/jobs.ts).
create or replace function public.record_job_run(
  p_name text, p_status text, p_duration_ms int, p_error text, p_next_run timestamptz, p_safe_to_retry boolean
) returns void language sql security definer set search_path = public as $$
  insert into public.system_jobs (name, last_run, next_run, duration_ms, status, run_count, error_count, last_error, safe_to_retry)
  values (p_name, now(), p_next_run, p_duration_ms, p_status, 1, case when p_status = 'failed' then 1 else 0 end,
          case when p_status = 'failed' then left(p_error, 1000) end, coalesce(p_safe_to_retry, false))
  on conflict (name) do update set
    last_run = now(),
    next_run = coalesce(excluded.next_run, public.system_jobs.next_run),
    duration_ms = excluded.duration_ms,
    status = excluded.status,
    run_count = public.system_jobs.run_count + 1,
    error_count = public.system_jobs.error_count + case when excluded.status = 'failed' then 1 else 0 end,
    last_error = case when excluded.status = 'failed' then excluded.last_error else public.system_jobs.last_error end,
    safe_to_retry = coalesce(p_safe_to_retry, public.system_jobs.safe_to_retry);
$$;

revoke all on function public.record_error_event(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_job_run(text, text, int, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_error_event(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.record_job_run(text, text, int, text, timestamptz, boolean) to service_role;
