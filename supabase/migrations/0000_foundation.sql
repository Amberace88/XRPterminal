-- XRP Terminal — foundation schema (profiles, roles, helpers, audit log)
-- All user-owned tables in later migrations reference public.profiles(id) and use RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 60),
  avatar_url text,
  timezone text default 'UTC',
  locale text default 'en' check (locale in ('en','lv','es','ru')),
  currency text default 'USD' check (currency in ('USD','EUR','GBP')),
  plan text not null default 'free' check (plan in ('free','pro','proplus')),
  subscription_status text,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  social_visibility text not null default 'private' check (social_visibility in ('public','followers','private')),
  preferences jsonb not null default '{}'::jsonb,
  referral_code text unique default encode(gen_random_bytes(5), 'hex'),
  referred_by text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- is_admin(): server-side role check usable inside RLS policies
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'active');
$$;

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (id = auth.uid() or public.is_admin());
-- users may update their own non-privileged fields; plan/role/status are protected by trigger below
create policy "profiles: update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin update" on public.profiles for update using (public.is_admin());

-- prevent users from escalating plan/role/status/stripe fields (only service role or admin may change them)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.plan := old.plan;
    new.role := old.role;
    new.status := old.status;
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.referral_code := old.referral_code;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_fields();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, referred_by)
  values (new.id, new.email, split_part(new.email, '@', 1), new.raw_user_meta_data->>'referral_code')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- audit log (spec §143) — append-only
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action, created_at desc);
alter table public.audit_logs enable row level security;
create policy "audit: read own or admin" on public.audit_logs for select using (user_id = auth.uid() or public.is_admin());
create policy "audit: insert own" on public.audit_logs for insert with check (user_id = auth.uid() and actor_id = auth.uid());
-- no update/delete policies => immutable for clients

create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'This table is append-only (immutable records)';
end $$;
-- deletes are blocked; updates are only possible via FK "on delete set null" during GDPR account deletion
-- (clients have no UPDATE policy, so they cannot modify rows).
create trigger audit_logs_immutable before delete on public.audit_logs for each row execute function public.prevent_mutation();
