-- Destinations: the owner's own list that ties campaign names and TravelCRM packages together.
-- Applied to the project on 2026-11-20 as migrations "destinations", "destination_cost_fix" and
-- "campaign_overview_destination". Summary of what they create:
--   table public.destinations (name, country, keywords[]) with a starting list of 28 rows
--   campaigns.destination_id, campaigns.destination_manual, crm_departures.destination_id
--   match_destination(text): the destination whose name or longest keyword appears in the text
--   apply_destinations(): re-reads every campaign and package against the list (hand-set ones are kept),
--     fills run_by from names ending "date - Staff", and refreshes the TravelCRM row in integration_status
--   destination_cost(p_days): spend against deposit pax per destination
--   campaign_overview(p_days) now also returns destination_id, destination and destination_manual
--   cron job apply-destinations-hourly at minute 20
create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_email text
);
alter table public.campaigns
  add column if not exists destination_id uuid references public.destinations(id) on delete set null,
  add column if not exists destination_manual boolean not null default false;
alter table public.crm_departures
  add column if not exists destination_id uuid references public.destinations(id) on delete set null;
