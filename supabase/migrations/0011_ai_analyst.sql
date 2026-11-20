-- Night analyst (Luqman): nightly AI study of the ads, a notebook of lessons, and proposals.
-- Applied to the project on 2026-11-20 as migration "ai_analyst". Creates ai_reports and ai_learnings,
-- adds report_id, expected, confidence, entity_level and entity_id to proposals, adds the ai_model row to
-- integration_status, the ad_overview(p_days, p_limit) and run_analyst() functions, and two schedules
-- (Malaysia time): full Meta sync at 01:37 and the analyst at 02:10.
insert into public.integration_status (key, name, used_for, status, detail)
values ('ai_model', 'AI model', 'The thinking behind the AI staff: nightly analysis, lessons and proposals.', 'not_set_up', 'Not connected yet. Paste an Anthropic API key below.')
on conflict (key) do nothing;

create table if not exists public.ai_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  agent text not null default 'analyst',
  period_days int not null default 30,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  review jsonb not null default '[]'::jsonb,
  model text, input_tokens int, output_tokens int, triggered_by text
);
create table if not exists public.ai_learnings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  agent text not null default 'analyst',
  lesson text not null, evidence text, confidence text,
  report_id bigint references public.ai_reports(id) on delete set null,
  is_active boolean not null default true,
  edited_by_email text
);
create index if not exists ai_learnings_report_id_idx on public.ai_learnings (report_id);
alter table public.proposals
  add column if not exists report_id bigint references public.ai_reports(id) on delete set null,
  add column if not exists expected text,
  add column if not exists confidence text,
  add column if not exists entity_level text,
  add column if not exists entity_id uuid;
create index if not exists proposals_report_id_idx on public.proposals (report_id);
alter table public.ai_reports enable row level security;
alter table public.ai_learnings enable row level security;
create policy "signed-in users can read ai reports" on public.ai_reports for select to authenticated using (true);
create policy "signed-in users have full access to lessons" on public.ai_learnings for all to authenticated using (true) with check (true);

create or replace function public.ad_overview(p_days int default 30, p_limit int default 150)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.spend desc), '[]'::jsonb)
  from (
    select d.id, c.name as campaign, s.name as ad_set, d.name as ad, d.delivery_status as status, c.country,
           sum(p.spend) as spend, sum(p.meta_leads) as leads, sum(p.impressions) as impressions, sum(p.link_clicks) as clicks,
           count(*) filter (where p.spend > 0) as days_with_spend
    from public.ad_spend_daily p
    join public.ads d on d.id = p.entity_id
    join public.ad_sets s on s.id = d.ad_set_id
    join public.campaigns c on c.id = s.campaign_id
    where p.level = 'ad' and p.spend_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - p_days
    group by d.id, c.name, s.name, d.name, d.delivery_status, c.country
    having sum(p.spend) > 0
    order by sum(p.spend) desc
    limit p_limit
  ) x;
$$;
grant execute on function public.ad_overview(int, int) to authenticated;
revoke execute on function public.ad_overview(int, int) from anon, public;

create or replace function public.run_analyst()
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://cyhefngfibwblixezmtz.supabase.co/functions/v1/ai-analyst',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_key')),
    body := '{"action": "run"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.run_analyst() from public, anon, authenticated;

select cron.schedule('meta-sync-daily', '37 17 * * *', $$select public.run_meta('{"days": 4, "structure": "all"}'::jsonb)$$);
select cron.schedule('ai-analyst-nightly', '10 18 * * *', $$select public.run_analyst()$$);
