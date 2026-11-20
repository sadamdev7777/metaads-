-- Real Meta data replaces the sample rows, and an hourly job keeps it fresh.

-- 2. Columns the sync fills.
alter table public.campaigns
  add column if not exists objective text,
  add column if not exists country text,
  add column if not exists meta_created_at timestamptz,
  add column if not exists tagged_by_email text,
  add column if not exists synced_at timestamptz;
alter table public.ad_sets
  add column if not exists delivery_status text,
  add column if not exists synced_at timestamptz;
alter table public.ads
  add column if not exists delivery_status text,
  add column if not exists synced_at timestamptz;
alter table public.ad_spend_daily
  add column if not exists impressions integer not null default 0,
  add column if not exists link_clicks integer not null default 0;

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null default 'meta',
  triggered_by text,
  ok boolean,
  summary jsonb not null default '{}'::jsonb,
  error text
);
alter table public.sync_runs enable row level security;
create policy "signed-in users can read sync runs" on public.sync_runs for select to authenticated using (true);

-- 3. Hourly schedule. The job calls the meta-sync function with a key kept in Vault.
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cron_key');
  end if;
end $$;

create or replace function public.run_meta_sync(p_days int default 3)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://cyhefngfibwblixezmtz.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_key')
    ),
    body := jsonb_build_object('days', p_days),
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.run_meta_sync(int) from public, anon, authenticated;

select cron.schedule('meta-sync-hourly', '7 * * * *', $$select public.run_meta_sync(3)$$);
