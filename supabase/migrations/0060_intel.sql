-- XRP Terminal — 0060 intel: news, claim check, AI briefs/usage, alerts, watchlists,
-- verified traders, follows, social reports & moderation.
-- Conventions: user-owned tables → RLS user_id = auth.uid() (+ admin read); public data →
-- read for anon/authenticated, writes via service role only (no client write policies).

-- ===========================================================================
-- NEWS (metadata only — never full articles; spec §75, §202)
-- ===========================================================================
create table if not exists public.news_sources (
  id text primary key,
  name text not null,
  feed_url text not null,
  homepage text,
  xrp_scoped boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.news_sources enable row level security;
create policy "news_sources: public read" on public.news_sources for select to anon, authenticated using (true);

create table if not exists public.news_clusters (
  id text primary key,                         -- stable hash of lead URL
  title text not null,
  lead_url text not null,
  sources text[] not null default '{}',
  source_count int not null default 1 check (source_count >= 1),
  categories text[] not null default '{}',
  primary_category text not null,
  entities text[] not null default '{}',
  first_published_at timestamptz not null,
  last_published_at timestamptz not null,
  summary text check (char_length(summary) <= 600),   -- AI summary (optional)
  summary_model text,
  summary_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists news_clusters_last_idx on public.news_clusters(last_published_at desc);
create trigger news_clusters_updated_at before update on public.news_clusters for each row execute function public.set_updated_at();
alter table public.news_clusters enable row level security;
create policy "news_clusters: public read" on public.news_clusters for select to anon, authenticated using (true);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null check (char_length(title) <= 300),
  source text not null,
  source_id text references public.news_sources(id) on delete set null,
  published_at timestamptz not null,
  excerpt text check (char_length(excerpt) <= 300),
  category text not null check (category in ('MARKET','XRPL','RIPPLE','REGULATION','INSTITUTIONAL','PAYMENTS','RLUSD','EXCHANGES','MACRO','TECHNOLOGY','SECURITY','DEVELOPMENT','COMMUNITY')),
  categories text[] not null default '{}',
  entities text[] not null default '{}',
  relevance text not null default 'XRP' check (relevance in ('XRP','MARKET')),
  asset text not null default 'XRP',
  cluster_id text references public.news_clusters(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists news_published_idx on public.news(published_at desc);
create index if not exists news_category_idx on public.news(category, published_at desc);
create index if not exists news_cluster_idx on public.news(cluster_id);
alter table public.news enable row level security;
create policy "news: public read" on public.news for select to anon, authenticated using (true);

-- source_id FK must not block inserts for unknown sources
insert into public.news_sources (id, name, feed_url, homepage, xrp_scoped) values
  ('coindesk','CoinDesk','https://www.coindesk.com/arc/outboundfeeds/rss/','https://www.coindesk.com',false),
  ('cointelegraph-xrp','Cointelegraph','https://cointelegraph.com/rss/tag/xrp','https://cointelegraph.com',true),
  ('cointelegraph','Cointelegraph','https://cointelegraph.com/rss','https://cointelegraph.com',false),
  ('decrypt','Decrypt','https://decrypt.co/feed','https://decrypt.co',false),
  ('theblock','The Block','https://www.theblock.co/rss.xml','https://www.theblock.co',false),
  ('cryptoslate','CryptoSlate','https://cryptoslate.com/feed/','https://cryptoslate.com',false),
  ('xrpl-blog','XRPL.org Blog','https://xrpl.org/blog/rss.xml','https://xrpl.org/blog',true),
  ('utoday','U.Today','https://u.today/rss','https://u.today',false)
on conflict (id) do nothing;

-- ===========================================================================
-- CLAIM CHECK (spec §73–74)
-- ===========================================================================
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  claim text not null check (char_length(claim) between 5 and 1000),
  classification text not null check (classification in ('CONFIRMED','DOCUMENTED','PARTIALLY SUPPORTED','ANALYSIS','SPECULATIVE','UNVERIFIED','OUTDATED','INACCURATE')),
  model_classification text,
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW')),
  reasoning text,
  context text,
  adjustments jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists claims_user_idx on public.claims(user_id, created_at desc);
alter table public.claims enable row level security;
create policy "claims: read own or admin" on public.claims for select using (user_id = auth.uid() or public.is_admin());

create table if not exists public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  kind text not null check (kind in ('supporting','counter')),
  summary text not null,
  url text not null,
  source text,
  published text,
  created_at timestamptz not null default now()
);
create index if not exists claim_evidence_claim_idx on public.claim_evidence(claim_id);
alter table public.claim_evidence enable row level security;
create policy "claim_evidence: read via claim" on public.claim_evidence for select using (
  exists (select 1 from public.claims c where c.id = claim_id and (c.user_id = auth.uid() or public.is_admin()))
);

-- ===========================================================================
-- AI briefs & usage (spec §69–70, §159, §239)
-- ===========================================================================
create table if not exists public.ai_briefs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('daily','weekly')),
  narrative jsonb not null,
  snapshot jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ai_briefs_type_idx on public.ai_briefs(type, created_at desc);
alter table public.ai_briefs enable row level security;
create policy "ai_briefs: public read" on public.ai_briefs for select to anon, authenticated using (true);
create trigger ai_briefs_immutable before update on public.ai_briefs for each row execute function public.prevent_mutation();

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  feature text not null check (feature in ('brief','ask','claim_check','news_summary')),
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_search boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);
create index if not exists ai_usage_feature_idx on public.ai_usage(feature, created_at desc);
alter table public.ai_usage enable row level security;
create policy "ai_usage: read own or admin" on public.ai_usage for select using (user_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- WATCHLISTS (spec §123, §181). `watchlists` may also be created by 0010 — guarded.
-- ===========================================================================
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Default',
  created_at timestamptz not null default now()
);
alter table public.watchlists enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'watchlists' and policyname = 'watchlists: own') then
    create policy "watchlists: own" on public.watchlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  watchlist_id uuid references public.watchlists(id) on delete cascade,
  kind text not null check (kind in ('pair','wallet','trader','topic','entity')),
  value text not null check (char_length(value) between 1 and 120),
  label text check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);
create index if not exists watchlist_items_user_idx on public.watchlist_items(user_id, created_at desc);
alter table public.watchlist_items enable row level security;
create policy "watchlist_items: own" on public.watchlist_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.enforce_watchlist_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int; lim int;
begin
  if auth.uid() is null then return new; end if;
  select plan into p from public.profiles where id = new.user_id;
  lim := case coalesce(p, 'free') when 'proplus' then 500 when 'pro' then 100 else 15 end; -- mirrors src/lib/entitlements.ts
  select count(*) into n from public.watchlist_items where user_id = new.user_id;
  if n >= lim then raise exception 'Watchlist limit reached for your plan (% items).', lim using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger watchlist_items_limit before insert on public.watchlist_items for each row execute function public.enforce_watchlist_limit();

-- ===========================================================================
-- ALERTS (spec §124–127, §188–191)
-- ===========================================================================
create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  conditions jsonb not null check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) between 1 and 4),
  priority text not null default 'normal' check (priority in ('low','normal','critical')),
  cooldown_min int not null default 30 check (cooldown_min between 1 and 10080),
  channels jsonb not null default '{"inApp":true,"push":false,"email":false}'::jsonb,
  enabled boolean not null default true,
  server_eval boolean not null default false,       -- all conditions evaluable server-side (price-type)
  last_state boolean,                               -- rising-edge memory for the server job
  last_triggered_at timestamptz,
  trigger_count int not null default 0,
  day_key date,
  day_count int not null default 0,
  watchlist_item_id uuid references public.watchlist_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alert_rules_user_idx on public.alert_rules(user_id, created_at desc);
create index if not exists alert_rules_server_idx on public.alert_rules(server_eval, enabled) where server_eval and enabled;
create trigger alert_rules_updated_at before update on public.alert_rules for each row execute function public.set_updated_at();
alter table public.alert_rules enable row level security;
create policy "alert_rules: own" on public.alert_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alert_rules: admin read" on public.alert_rules for select using (public.is_admin());

-- Server-side plan enforcement (spec §138). Numbers mirror src/lib/entitlements.ts.
create or replace function public.enforce_alert_rule_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int; lim int;
begin
  if auth.uid() is null then return new; end if;  -- service role / jobs
  select plan into p from public.profiles where id = new.user_id;
  p := coalesce(p, 'free');
  lim := case p when 'proplus' then 250 when 'pro' then 50 else 5 end;
  if tg_op = 'INSERT' and not exists (select 1 from public.alert_rules where id = new.id) then
    select count(*) into n from public.alert_rules where user_id = new.user_id;
    if n >= lim then raise exception 'Alert rule limit reached for your plan (% rules).', lim using errcode = 'P0001'; end if;
  end if;
  if jsonb_array_length(new.conditions) > 1 and p <> 'proplus' then
    raise exception 'Multi-condition smart alerts require Pro+.' using errcode = 'P0001';
  end if;
  if p = 'free' and exists (select 1 from jsonb_array_elements(new.conditions) c where c->>'type' in ('volatility_above','regime_change','forecast_change')) then
    raise exception 'Volatility, regime and forecast alerts require Pro.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger alert_rules_limits before insert or update on public.alert_rules for each row execute function public.enforce_alert_rule_limits();

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete set null,
  rule_name text,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 2000),
  priority text not null default 'normal' check (priority in ('low','normal','critical')),
  origin text not null default 'client' check (origin in ('client','server','test')),
  channels text[] not null default '{}',
  dedupe_key text,
  suppressed text check (suppressed in ('cooldown','duplicate','daily_limit')),
  created_at timestamptz not null default now()
);
create index if not exists alert_events_user_idx on public.alert_events(user_id, created_at desc);
alter table public.alert_events enable row level security;
-- append-only for clients: select + insert own, no update/delete policies
create policy "alert_events: read own or admin" on public.alert_events for select using (user_id = auth.uid() or public.is_admin());
create policy "alert_events: insert own" on public.alert_events for insert with check (user_id = auth.uid());

create table if not exists public.alert_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app boolean not null default true,
  push boolean not null default false,
  email boolean not null default false,
  daily_limit int not null default 50 check (daily_limit between 1 and 500),
  updated_at timestamptz not null default now()
);
create trigger alert_settings_updated_at before update on public.alert_settings for each row execute function public.set_updated_at();
alter table public.alert_settings enable row level security;
create policy "alert_settings: own" on public.alert_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- VERIFIED TRADERS (spec §82–87, §229–231, §290)
-- ===========================================================================
create table if not exists public.traders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_url text,
  bio text check (char_length(bio) <= 400),
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('VERIFIED','UNVERIFIED','PENDING','REVOKED')),
  verified_at timestamptz,
  public_profile boolean not null default false,
  public_pnl boolean not null default false,
  public_positions boolean not null default false,
  public_trades boolean not null default false,
  public_history boolean not null default false,
  public_wallet boolean not null default false,
  anonymous_stats boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists traders_public_idx on public.traders(verification_status, public_profile);
create trigger traders_updated_at before update on public.traders for each row execute function public.set_updated_at();
alter table public.traders enable row level security;
create policy "traders: public verified" on public.traders for select to anon, authenticated using (verification_status = 'VERIFIED' and public_profile);
create policy "traders: read own or admin" on public.traders for select using (user_id = auth.uid() or public.is_admin());
create policy "traders: insert own" on public.traders for insert with check (user_id = auth.uid());
create policy "traders: update own" on public.traders for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "traders: admin update" on public.traders for update using (public.is_admin());

-- users can never self-verify (only service role after on-chain proof, or admins)
create or replace function public.protect_trader_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.verification_status := 'UNVERIFIED';
      new.verified_at := null;
    else
      new.verification_status := old.verification_status;
      new.verified_at := old.verified_at;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end $$;
create trigger traders_protect before insert or update on public.traders for each row execute function public.protect_trader_fields();

create table if not exists public.trader_accounts (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'xrpl_wallet' check (kind in ('xrpl_wallet','exchange_readonly')),
  address text not null check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  status text not null default 'PENDING' check (status in ('VERIFIED','UNVERIFIED','PENDING','REVOKED')),
  challenge_code text,
  challenge_created_at timestamptz,
  challenge_expires_at timestamptz,
  verified_at timestamptz,
  verified_tx_hash text,
  verified_ledger bigint,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, address)
);
create index if not exists trader_accounts_user_idx on public.trader_accounts(user_id, created_at desc);
alter table public.trader_accounts enable row level security;
-- read own; ALL writes via service role (challenge + on-chain verification in /api/traders/*)
create policy "trader_accounts: read own or admin" on public.trader_accounts for select using (user_id = auth.uid() or public.is_admin());

create table if not exists public.trader_metrics (
  trader_id uuid primary key references public.traders(id) on delete cascade,
  source text not null check (source in ('XRPL_DEX','PAPER','EXCHANGE_READONLY')),
  quote_asset text,
  metrics jsonb not null,
  score numeric,
  eligible boolean not null default false,
  trade_count int not null default 0,
  computed_at timestamptz not null default now()
);
alter table public.trader_metrics enable row level security;
create policy "trader_metrics: public for verified public traders" on public.trader_metrics for select to anon, authenticated using (
  exists (select 1 from public.traders t where t.id = trader_id and t.verification_status = 'VERIFIED' and t.public_profile)
);
create policy "trader_metrics: own or admin" on public.trader_metrics for select using (
  exists (select 1 from public.traders t where t.id = trader_id and (t.user_id = auth.uid() or public.is_admin()))
);

create table if not exists public.trader_trades (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  source text not null check (source in ('XRPL_DEX','PAPER','EXCHANGE_READONLY')),
  quote_asset text,
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  qty numeric not null check (qty > 0),
  entry_price numeric not null check (entry_price > 0),
  exit_price numeric not null check (exit_price > 0),
  pnl numeric not null,
  return_pct numeric not null,
  holding_ms bigint not null,
  exit_hash text,
  created_at timestamptz not null default now(),
  unique (trader_id, exit_hash, entry_time)
);
create index if not exists trader_trades_trader_idx on public.trader_trades(trader_id, exit_time desc);
alter table public.trader_trades enable row level security;
create policy "trader_trades: public when shared" on public.trader_trades for select to anon, authenticated using (
  exists (select 1 from public.traders t where t.id = trader_id and t.verification_status = 'VERIFIED' and t.public_profile and t.public_trades)
);
create policy "trader_trades: own or admin" on public.trader_trades for select using (
  exists (select 1 from public.traders t where t.id = trader_id and (t.user_id = auth.uid() or public.is_admin()))
);

-- ===========================================================================
-- FOLLOWS (spec §219)
-- ===========================================================================
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('trader','wallet','topic','news_category')),
  target_id text not null check (char_length(target_id) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index if not exists follows_user_idx on public.follows(user_id, created_at desc);
create index if not exists follows_target_idx on public.follows(target_type, target_id);
alter table public.follows enable row level security;
create policy "follows: own" on public.follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- SOCIAL REPORTS & MODERATION (spec §88, §165–166)
-- ===========================================================================
create table if not exists public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('trader','content','news','wallet','other')),
  target_id text check (char_length(target_id) <= 200),
  category text not null check (category in ('scam','fraud','impersonation','misinformation','harassment','spam','fake_performance')),
  details text check (char_length(details) <= 2000),
  content_flags jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_reports_status_idx on public.social_reports(status, created_at desc);
create index if not exists social_reports_reporter_idx on public.social_reports(reporter_id, created_at desc);
create trigger social_reports_updated_at before update on public.social_reports for each row execute function public.set_updated_at();
alter table public.social_reports enable row level security;
create policy "social_reports: insert own" on public.social_reports for insert with check (reporter_id = auth.uid());
create policy "social_reports: read own or admin" on public.social_reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy "social_reports: admin update" on public.social_reports for update using (public.is_admin());

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.social_reports(id) on delete set null,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('dismiss','warn','hide_content','revoke_verification','suspend_user','note')),
  target_type text,
  target_id text,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_report_idx on public.moderation_actions(report_id);
alter table public.moderation_actions enable row level security;
create policy "moderation_actions: admin read" on public.moderation_actions for select using (public.is_admin());
create policy "moderation_actions: admin insert" on public.moderation_actions for insert with check (public.is_admin() and admin_id = auth.uid());
-- audit trail: no update/delete for anyone except FK set-null
create trigger moderation_actions_no_delete before delete on public.moderation_actions for each row execute function public.prevent_mutation();
