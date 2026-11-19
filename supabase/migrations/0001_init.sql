-- MTB Marketing AI: Phase 0 schema.
-- Everyone who signs in has full access. The activity log can be added to and read, never changed.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  user_email text not null,
  user_name text,
  action text not null,
  area text not null,
  details jsonb
);
create index activity_log_created_at_idx on public.activity_log (created_at desc);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  travelcrm_id text unique,
  name text not null,
  country text not null,
  deposit_per_pax numeric(10,2),
  landing_page_url text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departures (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  departure_date date not null,
  seats_total int not null,
  seats_filled int not null default 0,
  is_sample boolean not null default false,
  unique (product_id, departure_date)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text,
  placement text check (placement in ('Reels','Feed','Story')),
  format text check (format in ('PNG','MP4')),
  aspect_ratio text,
  country text,
  talent text,
  uploaded_by uuid references auth.users(id) on delete set null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  meta_campaign_id text unique,
  name text not null,
  product_id uuid references public.products(id) on delete set null,
  run_by text,
  source text not null default 'meta' check (source in ('system','meta')),
  utm text,
  delivery_status text not null default 'draft',
  daily_budget numeric(12,2),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_product_id_idx on public.campaigns (product_id);

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  meta_adset_id text unique,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  format text,
  daily_budget numeric(12,2),
  is_sample boolean not null default false
);
create index ad_sets_campaign_id_idx on public.ad_sets (campaign_id);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  meta_ad_id text unique,
  ad_set_id uuid not null references public.ad_sets(id) on delete cascade,
  name text not null,
  media_id uuid references public.media(id) on delete set null,
  review_status text,
  is_sample boolean not null default false
);
create index ads_ad_set_id_idx on public.ads (ad_set_id);
create index ads_media_id_idx on public.ads (media_id);

create table public.ad_spend_daily (
  id bigint generated always as identity primary key,
  level text not null check (level in ('campaign','ad_set','ad')),
  entity_id uuid not null,
  spend_date date not null,
  spend numeric(12,2) not null default 0,
  meta_leads int not null default 0,
  unique (level, entity_id, spend_date)
);

-- Phone numbers are personal data: store normalised, never write them to logs.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_normalized text not null,
  product_id uuid references public.products(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  utm text
);
create index leads_phone_idx on public.leads (phone_normalized);
create index leads_product_id_idx on public.leads (product_id);
create index leads_campaign_id_idx on public.leads (campaign_id);

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  travelcrm_booking_id text unique,
  phone_normalized text not null,
  product_id uuid references public.products(id) on delete set null,
  departure_id uuid references public.departures(id) on delete set null,
  pax int not null,
  deposit_date date not null
);
create index deposits_phone_idx on public.deposits (phone_normalized);
create index deposits_product_id_idx on public.deposits (product_id);
create index deposits_departure_id_idx on public.deposits (departure_id);

create table public.lead_deposit_matches (
  lead_id uuid not null references public.leads(id) on delete cascade,
  deposit_id uuid not null references public.deposits(id) on delete cascade,
  match_method text not null default 'phone',
  created_at timestamptz not null default now(),
  primary key (lead_id, deposit_id)
);
create index lead_deposit_matches_deposit_idx on public.lead_deposit_matches (deposit_id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_type text not null,
  target text not null,
  reason text,
  numbers text,
  agent text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','applied')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_email text,
  decided_at timestamptz,
  is_sample boolean not null default false
);
create index proposals_decided_by_idx on public.proposals (decided_by);

create table public.agent_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null,
  action text not null,
  reason text,
  is_sample boolean not null default false
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  is_sample boolean not null default false
);

-- One row of settings. Null means "not decided yet".
create table public.rules (
  id int primary key default 1 check (id = 1),
  target_cost_per_pax numeric(10,2) not null default 50,
  limit_cost_per_pax numeric(10,2) not null default 80,
  monthly_budget numeric(12,2) not null default 100000,
  close_window_days int not null default 7,
  full_payment_days int not null default 50,
  min_pax_to_judge int not null default 30,
  max_budget_increase_pct numeric(5,2),
  new_campaign_start_budget numeric(12,2),
  daily_spend_limit numeric(12,2),
  max_actions_per_day int,
  lead_gap_alert_pct numeric(5,2),
  action_modes jsonb not null default '{"launch_campaign":"approval","raise_budget":"approval","turn_off_ad":"approval","pause_product":"approval"}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index rules_updated_by_idx on public.rules (updated_by);

create table public.budget_plan (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  country text not null,
  planned numeric(12,2) not null,
  is_sample boolean not null default false,
  unique (month, country)
);

create table public.integration_status (
  key text primary key,
  name text not null,
  used_for text,
  status text not null default 'not_set_up' check (status in ('connected','check','not_set_up')),
  detail text,
  last_checked_at timestamptz
);

create index media_uploaded_by_idx on public.media (uploaded_by);

-- Row level security: any signed-in user has full access, nobody else has any.
do $$
declare t text;
begin
  foreach t in array array['profiles','products','departures','media','campaigns','ad_sets','ads','ad_spend_daily',
    'leads','deposits','lead_deposit_matches','proposals','agent_log','notifications','rules','budget_plan','integration_status']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "signed-in users have full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Activity log: signed-in users can read it and add their own entries. No update or delete policy exists.
alter table public.activity_log enable row level security;
create policy "signed-in users can read the log" on public.activity_log
  for select to authenticated using (true);
create policy "signed-in users can add their own entries" on public.activity_log
  for insert to authenticated
  with check (user_id = (select auth.uid()) and user_email = ((select auth.jwt()) ->> 'email'));

-- Keep a profile row for every account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
