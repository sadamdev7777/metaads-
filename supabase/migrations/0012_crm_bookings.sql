-- Closed bookings from TravelCRM, kept without customer names or full phone numbers.
-- A nightly Claude scheduled task ("MTB: tarik deposit TravelCRM setiap malam", 00:45 Malaysia time) fills these.
create table if not exists public.crm_departures (
  departure_id bigint primary key,
  package_code text, package_name text, country text, departure_date date, seats_available int,
  updated_at timestamptz not null default now()
);
create table if not exists public.crm_bookings (
  booking_id bigint primary key,
  status text not null,
  pax int not null default 0,
  booking_date date not null,
  departure_id bigint,
  phone_last4 text,
  synced_at timestamptz not null default now()
);
create index if not exists crm_bookings_date_idx on public.crm_bookings (booking_date);
create index if not exists crm_bookings_departure_idx on public.crm_bookings (departure_id);
alter table public.crm_departures enable row level security;
alter table public.crm_bookings enable row level security;
create policy "signed-in users can read crm departures" on public.crm_departures for select to authenticated using (true);
create policy "signed-in users can read crm bookings" on public.crm_bookings for select to authenticated using (true);

-- Deposit pax and ad spend side by side for each country, over the last p_days days.
-- A contact number that appears on 3 or more bookings in the window is treated as an agent or staff entry.
create or replace function public.country_cost(p_days int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with b as (
    select coalesce(d.country, 'Unknown') as country, k.pax, k.booking_id,
           (k.phone_last4 is null or count(*) over (partition by k.phone_last4) >= 3) as shared
    from public.crm_bookings k
    left join public.crm_departures d on d.departure_id = k.departure_id
    where k.status in ('paid_deposit', 'full_payment')
      and k.booking_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - p_days
  ), dep as (
    select country, count(*) as bookings, sum(pax) as pax,
           sum(pax) filter (where not shared) as pax_direct, sum(pax) filter (where shared) as pax_shared
    from b group by country
  ), sp as (
    select coalesce(c.country, 'Not tagged') as country, sum(s.spend) as spend, sum(s.meta_leads) as leads
    from public.ad_spend_daily s join public.campaigns c on c.id = s.entity_id
    where s.level = 'campaign' and s.spend_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - p_days
    group by 1
  )
  select jsonb_build_object(
    'first_booking_date', (select min(booking_date) from public.crm_bookings),
    'last_synced', (select max(synced_at) from public.crm_bookings),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'country', coalesce(dep.country, sp.country), 'spend', coalesce(sp.spend, 0), 'leads', coalesce(sp.leads, 0),
      'bookings', coalesce(dep.bookings, 0), 'pax', coalesce(dep.pax, 0),
      'pax_direct', coalesce(dep.pax_direct, 0), 'pax_shared', coalesce(dep.pax_shared, 0)
    ) order by coalesce(sp.spend, 0) desc) from dep full join sp on sp.country = dep.country), '[]'::jsonb)
  );
$$;
grant execute on function public.country_cost(int) to authenticated;
revoke execute on function public.country_cost(int) from anon, public;
