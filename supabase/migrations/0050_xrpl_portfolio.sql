-- XRP Terminal — XRPL intelligence + portfolio (module owner: XRPL/Portfolio)
-- Tables: connected_accounts (+ wallets view), connected_account_secrets (service-role only),
--         portfolio_lots, wallet_labels, xrpl_accounts, xrpl_transactions (public cache),
--         trader_verification_challenges.
-- Principles: portfolio private by default (RLS own rows), no private keys/seeds ever stored,
-- exchange secrets encrypted (AES-256-GCM, app-side) and unreadable by clients, plan limits enforced in DB.

-- ---------------------------------------------------------------------------
-- connected accounts
-- ---------------------------------------------------------------------------
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('XRPL_WALLET','EXCHANGE_ACCOUNT','BLOCKCHAIN_WALLET','DEFI_ACCOUNT')),
  label text not null default '' check (char_length(label) <= 60),
  -- public XRPL classic address only (never a seed / secret)
  address text check (address is null or address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  tag bigint check (tag is null or (tag >= 0 and tag <= 4294967295)),
  exchange text check (exchange is null or exchange in ('binance')),
  key_fingerprint text,
  permissions jsonb,
  status text not null default 'active' check (status in ('active','pending','error','rejected')),
  status_message text,
  is_primary boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_accounts_xrpl_has_address check (type <> 'XRPL_WALLET' or address is not null),
  constraint connected_accounts_exchange_has_exchange check (type <> 'EXCHANGE_ACCOUNT' or (exchange is not null and key_fingerprint is not null))
);
create unique index if not exists connected_accounts_unique_wallet on public.connected_accounts(user_id, address, coalesce(tag, -1)) where type = 'XRPL_WALLET';
create unique index if not exists connected_accounts_unique_key on public.connected_accounts(user_id, exchange, key_fingerprint) where type = 'EXCHANGE_ACCOUNT';
create index if not exists connected_accounts_user_idx on public.connected_accounts(user_id, created_at);
create trigger connected_accounts_updated_at before update on public.connected_accounts for each row execute function public.set_updated_at();

alter table public.connected_accounts enable row level security;
create policy "connected_accounts: read own" on public.connected_accounts for select using (user_id = auth.uid() or public.is_admin());
create policy "connected_accounts: insert own" on public.connected_accounts for insert with check (user_id = auth.uid());
create policy "connected_accounts: update own" on public.connected_accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "connected_accounts: delete own" on public.connected_accounts for delete using (user_id = auth.uid());

-- Server-side plan limit enforcement (spec §39): free 1, pro 5, proplus unlimited.
-- Exchange connections require Pro or Pro+. Advisory lock prevents concurrent-insert races.
create or replace function public.enforce_connected_account_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_limit_json jsonb;
  v_limit integer;
  v_exchange_ok boolean;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('connected_accounts:' || new.user_id::text));
  select plan into v_plan from public.profiles where id = new.user_id;
  v_plan := coalesce(v_plan, 'free');
  -- limits come from public.entitlements (0010_platform) with a safe fallback: free 1, pro 5, proplus unlimited
  select value into v_limit_json from public.entitlements where plan_id = v_plan and key = 'connectedAccounts';
  if v_limit_json is null then
    v_limit := case v_plan when 'free' then 1 when 'pro' then 5 else null end;
  elsif jsonb_typeof(v_limit_json) = 'null' then
    v_limit := null;
  else
    v_limit := (v_limit_json #>> '{}')::integer;
  end if;
  select coalesce((value #>> '{}')::boolean, v_plan <> 'free') into v_exchange_ok from public.entitlements where plan_id = v_plan and key = 'exchangeConnections';
  v_exchange_ok := coalesce(v_exchange_ok, v_plan <> 'free');
  if new.type = 'EXCHANGE_ACCOUNT' and not v_exchange_ok then
    raise exception 'PLAN_REQUIRED: exchange connections require the Pro plan' using errcode = 'P0001';
  end if;
  if v_limit is not null then
    select count(*) into v_count from public.connected_accounts where user_id = new.user_id;
    if v_count >= v_limit then
      raise exception 'PLAN_LIMIT: plan % allows % connected account(s)', v_plan, v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger connected_accounts_limit before insert on public.connected_accounts for each row execute function public.enforce_connected_account_limit();

-- Convenience view: XRPL wallets only. security_invoker → caller's RLS applies.
create or replace view public.wallets with (security_invoker = true) as
  select id, user_id, label, address, tag, is_primary, status, last_synced_at, created_at
  from public.connected_accounts where type = 'XRPL_WALLET';

-- Encrypted exchange credentials. RLS enabled with NO policies and no grants → only the
-- service role (server routes) can read or write. Values are AES-256-GCM payloads produced by
-- the application with CREDENTIALS_ENCRYPTION_KEY; the key never touches the database.
create table if not exists public.connected_account_secrets (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  encrypted_api_key text not null,
  encrypted_secret text not null,
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
create index if not exists connected_account_secrets_user_idx on public.connected_account_secrets(user_id, created_at);
alter table public.connected_account_secrets enable row level security;
revoke all on public.connected_account_secrets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- portfolio cost-basis lots (manual entries)
-- ---------------------------------------------------------------------------
create table if not exists public.portfolio_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset text not null default 'XRP' check (asset in ('XRP')),
  side text not null check (side in ('buy','sell')),
  trade_date date not null,
  qty numeric(38,12) not null check (qty > 0),
  price numeric(38,12) not null check (price >= 0),
  fee numeric(38,12) not null default 0 check (fee >= 0),
  currency text not null default 'USD' check (currency in ('USD','EUR','GBP')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolio_lots_user_idx on public.portfolio_lots(user_id, created_at);
create index if not exists portfolio_lots_user_date_idx on public.portfolio_lots(user_id, trade_date);
create trigger portfolio_lots_updated_at before update on public.portfolio_lots for each row execute function public.set_updated_at();
alter table public.portfolio_lots enable row level security;
create policy "portfolio_lots: read own" on public.portfolio_lots for select using (user_id = auth.uid());
create policy "portfolio_lots: insert own" on public.portfolio_lots for insert with check (user_id = auth.uid());
create policy "portfolio_lots: update own" on public.portfolio_lots for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "portfolio_lots: delete own" on public.portfolio_lots for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- wallet labels with provenance (spec §30)
-- public rows (user_id null) are curated/imported by the service role; user rows are private.
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_labels (
  id uuid primary key default gen_random_uuid(),
  address text not null check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  label text not null check (char_length(label) between 1 and 80),
  category text not null default 'UNKNOWN' check (category in ('EXCHANGE','ISSUER','KNOWN_SERVICE','KNOWN_ENTITY','WHALE','SMART_MONEY','TRADER','HOLDER','UNKNOWN')),
  source text not null check (source in ('xrpscan-well-known','on-ledger-domain','user','admin')),
  provenance_url text,
  provenance_note text,
  verified boolean not null default false,
  is_user_provided boolean not null default false,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_labels_user_provided check ((is_user_provided and user_id is not null and source = 'user') or (not is_user_provided and user_id is null)),
  -- SMART_MONEY may only be assigned by admins with documented methodology, never by users
  constraint wallet_labels_no_user_smart_money check (not (is_user_provided and category = 'SMART_MONEY'))
);
create index if not exists wallet_labels_address_idx on public.wallet_labels(address);
create index if not exists wallet_labels_user_idx on public.wallet_labels(user_id, created_at);
create unique index if not exists wallet_labels_unique_public on public.wallet_labels(address, source, label) where user_id is null;
create trigger wallet_labels_updated_at before update on public.wallet_labels for each row execute function public.set_updated_at();
alter table public.wallet_labels enable row level security;
create policy "wallet_labels: read public or own" on public.wallet_labels for select using (user_id is null or user_id = auth.uid() or public.is_admin());
create policy "wallet_labels: insert own" on public.wallet_labels for insert with check (user_id = auth.uid() and is_user_provided and source = 'user');
create policy "wallet_labels: update own" on public.wallet_labels for update using (user_id = auth.uid()) with check (user_id = auth.uid() and is_user_provided and source = 'user');
create policy "wallet_labels: delete own" on public.wallet_labels for delete using (user_id = auth.uid());
create policy "wallet_labels: admin write" on public.wallet_labels for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- XRPL public-data cache (public read, service-role write only)
-- ---------------------------------------------------------------------------
create table if not exists public.xrpl_accounts (
  address text primary key check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  balance_drops numeric(30,0),
  sequence bigint,
  owner_count integer,
  flags bigint,
  domain text,
  account_data jsonb,
  first_tx_hash text,
  first_tx_time timestamptz,
  activated_by text,
  ledger_index bigint,
  server text,
  fetched_at timestamptz not null default now()
);
create index if not exists xrpl_accounts_fetched_idx on public.xrpl_accounts(fetched_at);
alter table public.xrpl_accounts enable row level security;
create policy "xrpl_accounts: public read" on public.xrpl_accounts for select to anon, authenticated using (true);

create table if not exists public.xrpl_transactions (
  hash text primary key check (hash ~ '^[0-9A-F]{64}$'),
  ledger_index bigint not null,
  tx_type text not null,
  account text not null,
  destination text,
  result text not null,
  delivered_drops numeric(30,0),
  delivered jsonb,
  close_time timestamptz,
  tx jsonb not null,
  meta jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists xrpl_transactions_account_idx on public.xrpl_transactions(account, ledger_index desc);
create index if not exists xrpl_transactions_destination_idx on public.xrpl_transactions(destination, ledger_index desc);
create index if not exists xrpl_transactions_ledger_idx on public.xrpl_transactions(ledger_index desc);
create index if not exists xrpl_transactions_close_time_idx on public.xrpl_transactions(close_time desc);
create index if not exists xrpl_transactions_large_xrp_idx on public.xrpl_transactions(delivered_drops desc) where tx_type = 'Payment' and delivered_drops is not null;
alter table public.xrpl_transactions enable row level security;
create policy "xrpl_transactions: public read" on public.xrpl_transactions for select to anon, authenticated using (true);
-- validated ledger data is immutable once cached
create trigger xrpl_transactions_immutable before update on public.xrpl_transactions for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- trader verification challenges (prove control of a public address without keys:
-- the user sends a tiny self-payment / memo containing the challenge; the server verifies on-ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.trader_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  address text not null check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  method text not null default 'memo' check (method in ('memo','destination_tag')),
  challenge text not null unique default encode(gen_random_bytes(12), 'hex'),
  status text not null default 'pending' check (status in ('pending','verified','expired','failed')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  verified_tx_hash text check (verified_tx_hash is null or verified_tx_hash ~ '^[0-9A-F]{64}$'),
  verified_ledger_index bigint,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trader_verification_user_idx on public.trader_verification_challenges(user_id, created_at);
create index if not exists trader_verification_address_idx on public.trader_verification_challenges(address, status);
alter table public.trader_verification_challenges enable row level security;
create policy "trader_verification: read own" on public.trader_verification_challenges for select using (user_id = auth.uid() or public.is_admin());
-- users may only create pending challenges; status transitions happen server-side (service role)
create policy "trader_verification: insert own pending" on public.trader_verification_challenges for insert
  with check (user_id = auth.uid() and status = 'pending' and verified_tx_hash is null and verified_at is null);
create policy "trader_verification: delete own pending" on public.trader_verification_challenges for delete using (user_id = auth.uid() and status = 'pending');
