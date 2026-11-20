create or replace function public.run_meta(p_body jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://cyhefngfibwblixezmtz.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_key')),
    body := p_body,
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.run_meta(jsonb) from public, anon, authenticated;

-- Every hour: active campaigns and the last 2 days of spend. Once a day (03:37 Malaysia time): everything.
select cron.schedule('meta-sync-hourly', '7 * * * *', $$select public.run_meta('{"days": 2, "structure": "active"}'::jsonb)$$);
select cron.schedule('meta-sync-daily', '37 19 * * *', $$select public.run_meta('{"days": 4, "structure": "all"}'::jsonb)$$);
