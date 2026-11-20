-- Read helpers for the Campaigns, Analysis and Dashboard pages, and a helper to load history in slices.
create index if not exists ad_spend_daily_date_idx on public.ad_spend_daily (spend_date);

-- Every real campaign with its totals for the last p_days days (Malaysia time).
create or replace function public.campaign_overview(p_days int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.spend desc, x.name), '[]'::jsonb)
  from (
    select c.id, c.meta_campaign_id, c.name, c.country, c.run_by, c.product_id, c.delivery_status, c.objective,
           c.daily_budget, c.meta_created_at, c.synced_at,
           coalesce(s.spend, 0) as spend, coalesce(s.leads, 0) as leads,
           coalesce(s.impressions, 0) as impressions, coalesce(s.clicks, 0) as clicks
    from public.campaigns c
    left join (
      select entity_id, sum(spend) as spend, sum(meta_leads) as leads, sum(impressions) as impressions, sum(link_clicks) as clicks
      from public.ad_spend_daily
      where level = 'campaign' and spend_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - p_days
      group by entity_id
    ) s on s.entity_id = c.id
    where not c.is_sample
  ) x;
$$;

-- Ad sets and ads of one campaign with the same totals.
create or replace function public.campaign_tree(p_campaign uuid, p_days int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with sp as (
    select level, entity_id, sum(spend) as spend, sum(meta_leads) as leads, sum(impressions) as impressions, sum(link_clicks) as clicks
    from public.ad_spend_daily
    where level in ('ad_set', 'ad') and spend_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - p_days
    group by level, entity_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'delivery_status', a.delivery_status, 'daily_budget', a.daily_budget,
    'spend', coalesce(s.spend, 0), 'leads', coalesce(s.leads, 0), 'impressions', coalesce(s.impressions, 0), 'clicks', coalesce(s.clicks, 0),
    'ads', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'delivery_status', d.delivery_status,
        'spend', coalesce(ds.spend, 0), 'leads', coalesce(ds.leads, 0), 'impressions', coalesce(ds.impressions, 0), 'clicks', coalesce(ds.clicks, 0)
      ) order by coalesce(ds.spend, 0) desc, d.name), '[]'::jsonb)
      from public.ads d left join sp ds on ds.level = 'ad' and ds.entity_id = d.id
      where d.ad_set_id = a.id
    )
  ) order by coalesce(s.spend, 0) desc, a.name), '[]'::jsonb)
  from public.ad_sets a left join sp s on s.level = 'ad_set' and s.entity_id = a.id
  where a.campaign_id = p_campaign;
$$;

-- Spend and leads for the current month, plus the latest sync.
create or replace function public.month_totals()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'spend', (select coalesce(sum(spend), 0) from public.ad_spend_daily where level = 'campaign' and spend_date >= date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur')::date),
    'leads', (select coalesce(sum(meta_leads), 0) from public.ad_spend_daily where level = 'campaign' and spend_date >= date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur')::date),
    'active', (select count(*) from public.campaigns where not is_sample and delivery_status = 'ACTIVE'),
    'campaigns', (select count(*) from public.campaigns where not is_sample),
    'last_sync', (select to_jsonb(r) from (select started_at, finished_at, ok, error, triggered_by, summary from public.sync_runs order by id desc limit 1) r),
    'last_good_sync', (select max(finished_at) from public.sync_runs where ok)
  );
$$;

grant execute on function public.campaign_overview(int), public.campaign_tree(uuid, int), public.month_totals() to authenticated;
revoke execute on function public.campaign_overview(int), public.campaign_tree(uuid, int), public.month_totals() from anon, public;

-- Loads p_days of history starting p_skip days back, without re-reading the campaign structure.
create or replace function public.run_meta_backfill(p_days int, p_skip int, p_structure boolean default false)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://cyhefngfibwblixezmtz.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_key')),
    body := jsonb_build_object('days', p_days, 'skip_days', p_skip, 'structure', p_structure),
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.run_meta_backfill(int, int, boolean) from public, anon, authenticated;
