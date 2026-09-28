-- XRP Terminal — Trade Lab (SIMULATED paper trading). Spec §89–§122, §212–§215, §266–§297.
-- Source of truth: paper_events (immutable, append-only ledger). paper_orders / paper_fills /
-- paper_positions / paper_trades are rebuildable PROJECTIONS of that ledger.
-- Paper data is kept strictly separate from real portfolio data (spec §295).
-- Depends on 0000_foundation.sql (profiles, is_admin(), set_updated_at(), prevent_mutation()).

-- ---------------------------------------------------------------------------
-- paper accounts
-- ---------------------------------------------------------------------------
create table if not exists public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Paper account' check (char_length(name) between 1 and 80),
  market text not null default 'XRP-USD' check (market in ('XRP-USD')),
  mode text not null default 'LIVE' check (mode in ('LIVE','REPLAY')),
  starting_capital numeric(20,8) not null check (starting_capital > 0),
  cash_balance numeric(24,8) not null default 0,
  equity numeric(24,8) not null default 0,
  max_drawdown_pct numeric(10,4) not null default 0,
  version integer not null default 1 check (version >= 1),
  status text not null default 'active' check (status in ('active','archived')),
  is_simulated boolean not null default true check (is_simulated),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paper_accounts_user_idx on public.paper_accounts(user_id, created_at);
create trigger paper_accounts_updated_at before update on public.paper_accounts for each row execute function public.set_updated_at();
alter table public.paper_accounts enable row level security;
create policy "paper_accounts: read own" on public.paper_accounts for select using (user_id = auth.uid() or public.is_admin());
create policy "paper_accounts: insert own" on public.paper_accounts for insert with check (user_id = auth.uid());
create policy "paper_accounts: update own" on public.paper_accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "paper_accounts: delete own" on public.paper_accounts for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- paper events — immutable simulation ledger (spec §214, §268)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  seq integer not null check (seq >= 1),
  version integer not null check (version >= 1),
  type text not null check (type in (
    'ACCOUNT_CREATED','VIRTUAL_CAPITAL_ASSIGNED','SETTINGS_UPDATED','ORDER_CREATED','ORDER_ACCEPTED',
    'ORDER_TRIGGERED','ORDER_FILLED','ORDER_CANCELLED','ORDER_EXPIRED','ORDER_REJECTED','FEE_CHARGED',
    'POSITION_OPENED','POSITION_UPDATED','POSITION_CLOSED','REALIZED_PNL','PRICE_MARKED',
    'RISK_LIMIT_BREACHED','ACCOUNT_RESET')),
  event_time timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (account_id, seq)
);
create index if not exists paper_events_user_idx on public.paper_events(user_id, created_at);
create index if not exists paper_events_account_idx on public.paper_events(account_id, seq);
alter table public.paper_events enable row level security;
create policy "paper_events: read own" on public.paper_events for select using (user_id = auth.uid() or public.is_admin());
create policy "paper_events: append own" on public.paper_events for insert with check (
  user_id = auth.uid() and exists (select 1 from public.paper_accounts a where a.id = account_id and a.user_id = auth.uid())
);
-- No update/delete policies: clients can only append. Updates are blocked for everyone by trigger.
-- Rows disappear only through ON DELETE CASCADE when the account / user is deleted (GDPR erasure).
create trigger paper_events_immutable before update on public.paper_events for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- projections (derived from the ledger; owner-writable, rebuildable)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  order_id text not null,
  version integer not null,
  side text not null check (side in ('BUY','SELL')),
  type text not null check (type in ('MARKET','LIMIT','STOP','STOP_LIMIT')),
  role text not null check (role in ('ENTRY','EXIT','STOP_LOSS','TAKE_PROFIT')),
  status text not null check (status in ('CREATED','OPEN','TRIGGERED','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED','REJECTED')),
  qty numeric(24,6) not null,
  filled_qty numeric(24,6) not null default 0,
  avg_fill_price numeric(24,8),
  limit_price numeric(24,8),
  stop_price numeric(24,8),
  time_in_force text not null default 'GTC' check (time_in_force in ('GTC','DAY')),
  expires_at timestamptz,
  triggered_at timestamptz,
  parent_order_id text,
  oco_group text,
  reason text,
  fees numeric(24,8) not null default 0,
  slippage_cost numeric(24,8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, order_id)
);
create index if not exists paper_orders_user_idx on public.paper_orders(user_id, created_at);

create table if not exists public.paper_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  fill_id text not null,
  order_id text not null,
  version integer not null,
  side text not null check (side in ('BUY','SELL')),
  qty numeric(24,6) not null,
  price numeric(24,8) not null,
  ref_price numeric(24,8) not null,
  slippage_bps numeric(10,4) not null,
  slippage_cost numeric(24,8) not null,
  gross numeric(24,8) not null,
  fee_rate numeric(10,6) not null,
  fee_amount numeric(24,8) not null,
  fee_source text not null,
  liquidity text not null check (liquidity in ('TAKER','MAKER')),
  filled_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (account_id, fill_id)
);
create index if not exists paper_fills_user_idx on public.paper_fills(user_id, created_at);

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  position_id text not null,
  version integer not null,
  side text not null default 'LONG' check (side in ('LONG')), -- v1 is long-only
  qty numeric(24,6) not null,
  avg_entry numeric(24,8) not null,
  fees numeric(24,8) not null default 0,
  opened_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, position_id)
);
create index if not exists paper_positions_user_idx on public.paper_positions(user_id, created_at);

create table if not exists public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  trade_id text not null,
  version integer not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  qty numeric(24,6) not null,
  avg_entry numeric(24,8) not null,
  avg_exit numeric(24,8) not null,
  gross_pnl numeric(24,8) not null,
  fees numeric(24,8) not null,
  net_pnl numeric(24,8) not null,
  return_pct numeric(12,6) not null,
  initial_stop numeric(24,8),
  initial_risk numeric(24,8),
  r_multiple numeric(12,6),
  exit_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (account_id, trade_id)
);
create index if not exists paper_trades_user_idx on public.paper_trades(user_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['paper_orders','paper_fills','paper_positions','paper_trades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: read own" on public.%I for select using (user_id = auth.uid() or public.is_admin())', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert with check (user_id = auth.uid() and exists (select 1 from public.paper_accounts a where a.id = account_id and a.user_id = auth.uid()))', t, t);
    execute format('create policy "%s: update own" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- journal (private — never exposed publicly, spec §106)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  trade_id text not null,
  setup text check (char_length(setup) <= 120),
  regime text check (char_length(regime) <= 40),
  tags text[] not null default '{}',
  confidence smallint check (confidence between 1 and 5),
  entry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, trade_id)
);
create index if not exists paper_journal_user_idx on public.paper_journal(user_id, created_at);
create index if not exists paper_journal_tags_idx on public.paper_journal using gin (tags);
alter table public.paper_journal enable row level security;
create policy "paper_journal: own" on public.paper_journal for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- historical replay sessions (spec §114, §283)
-- ---------------------------------------------------------------------------
create table if not exists public.replay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  market text not null default 'XRP-USD',
  timeframe text not null check (timeframe in ('1D','1h')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  starting_capital numeric(20,8) not null check (starting_capital > 0),
  strategy text,
  notes text check (char_length(notes) <= 5000),
  performance jsonb not null default '{}'::jsonb,
  session jsonb not null, -- includes the replay ledger (simulated events)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists replay_sessions_user_idx on public.replay_sessions(user_id, created_at);
alter table public.replay_sessions enable row level security;
create policy "replay_sessions: own" on public.replay_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- strategies + immutable versions (changing rules = new version, spec §211)
-- ---------------------------------------------------------------------------
create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  current_version integer not null default 1,
  backtest_runs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists strategies_user_idx on public.strategies(user_id, created_at);
alter table public.strategies enable row level security;
create policy "strategies: own" on public.strategies for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null check (version >= 1),
  rules jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique (strategy_id, version)
);
create index if not exists strategy_versions_user_idx on public.strategy_versions(user_id, created_at);
alter table public.strategy_versions enable row level security;
create policy "strategy_versions: read own" on public.strategy_versions for select using (user_id = auth.uid() or public.is_admin());
create policy "strategy_versions: insert own" on public.strategy_versions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = auth.uid())
);
create trigger strategy_versions_immutable before update on public.strategy_versions for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- backtests (spec §116, §210)
-- ---------------------------------------------------------------------------
create table if not exists public.backtests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  strategy_name text not null,
  strategy_version integer not null,
  timeframe text not null check (timeframe in ('1D','1h')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  starting_capital numeric(20,8) not null,
  fee_pct numeric(10,6) not null,
  slippage_bps numeric(10,4) not null,
  return_pct numeric(14,6),
  benchmark_return_pct numeric(14,6),
  max_drawdown_pct numeric(10,4),
  trade_count integer not null default 0,
  result jsonb not null,
  assumptions jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists backtests_user_idx on public.backtests(user_id, created_at);
alter table public.backtests enable row level security;
create policy "backtests: read own" on public.backtests for select using (user_id = auth.uid() or public.is_admin());
create policy "backtests: insert own" on public.backtests for insert with check (user_id = auth.uid());
create policy "backtests: delete own" on public.backtests for delete using (user_id = auth.uid());
create trigger backtests_immutable before update on public.backtests for each row execute function public.prevent_mutation();

create table if not exists public.backtest_trades (
  id bigint generated always as identity primary key,
  backtest_id uuid not null references public.backtests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_at timestamptz not null,
  exit_at timestamptz not null,
  entry_price numeric(24,8) not null,
  exit_price numeric(24,8) not null,
  qty numeric(24,6) not null,
  net_pnl numeric(24,8) not null,
  fees numeric(24,8) not null,
  return_pct numeric(14,6) not null,
  r_multiple numeric(12,6),
  exit_reason text not null check (exit_reason in ('SIGNAL','STOP','TARGET','END_OF_TEST')),
  created_at timestamptz not null default now()
);
create index if not exists backtest_trades_user_idx on public.backtest_trades(user_id, created_at);
create index if not exists backtest_trades_bt_idx on public.backtest_trades(backtest_id);
alter table public.backtest_trades enable row level security;
create policy "backtest_trades: read own" on public.backtest_trades for select using (user_id = auth.uid() or public.is_admin());
create policy "backtest_trades: insert own" on public.backtest_trades for insert with check (
  user_id = auth.uid() and exists (select 1 from public.backtests b where b.id = backtest_id and b.user_id = auth.uid())
);
create trigger backtest_trades_immutable before update on public.backtest_trades for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- challenges (spec §119, §288)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.paper_accounts(id) on delete set null,
  challenge text not null check (challenge in ('RISK_MANAGEMENT','REPLAY','DISCIPLINE_30D','LOW_DRAWDOWN')),
  status text not null default 'active' check (status in ('active','completed','failed','abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists paper_challenges_one_active on public.paper_challenges(user_id, challenge) where status = 'active';
create index if not exists paper_challenges_user_idx on public.paper_challenges(user_id, created_at);
create trigger paper_challenges_updated_at before update on public.paper_challenges for each row execute function public.set_updated_at();
alter table public.paper_challenges enable row level security;
create policy "paper_challenges: own" on public.paper_challenges for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- paper leaderboard — explicit opt-in, aggregated stats only (spec §120, §289)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_leaderboard_optin (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_alias text not null check (char_length(display_alias) between 3 and 30 and display_alias ~ '^[A-Za-z0-9_.-]+$'),
  opted_in boolean not null default true,
  account_id uuid references public.paper_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists paper_leaderboard_alias_idx on public.paper_leaderboard_optin(lower(display_alias));
create trigger paper_leaderboard_optin_updated_at before update on public.paper_leaderboard_optin for each row execute function public.set_updated_at();
alter table public.paper_leaderboard_optin enable row level security;
create policy "leaderboard_optin: own" on public.paper_leaderboard_optin for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Aggregated stats are written ONLY by the server (service role) after replaying the user's ledger
-- with the Trade Lab engine (/api/tradelab/leaderboard). Clients can read their own row.
create table if not exists public.paper_leaderboard_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_id uuid references public.paper_accounts(id) on delete set null,
  trade_count integer not null default 0,
  period_days integer not null default 0,
  return_pct numeric(14,6),
  max_drawdown_pct numeric(10,4),
  return_to_drawdown numeric(14,6),
  win_rate numeric(8,4),
  profit_factor numeric(14,6),
  consistency_pct numeric(8,4),
  engine_version text not null,
  computed_at timestamptz not null default now()
);
alter table public.paper_leaderboard_stats enable row level security;
create policy "leaderboard_stats: read own" on public.paper_leaderboard_stats for select using (user_id = auth.uid() or public.is_admin());
-- no insert/update/delete policies: service role only

-- Public view: ONLY opted-in users, ONLY aggregates, ONLY above the minimum sample
-- (≥ 20 closed trades and ≥ 30 days). No journal, orders, balances or identities beyond the alias.
create or replace view public.paper_leaderboard as
  select o.display_alias,
         s.trade_count,
         s.period_days,
         s.return_pct,
         s.max_drawdown_pct,
         s.return_to_drawdown,
         s.win_rate,
         s.profit_factor,
         s.consistency_pct,
         s.computed_at,
         true as is_simulated
    from public.paper_leaderboard_stats s
    join public.paper_leaderboard_optin o on o.user_id = s.user_id and o.opted_in
   where s.trade_count >= 20 and s.period_days >= 30;
grant select on public.paper_leaderboard to anon, authenticated;
