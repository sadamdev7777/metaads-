-- NOT APPLIED YET: needs the owner's confirmation in Supabase. Until then every page filters is_sample = false.
delete from public.ads where is_sample;
delete from public.ad_sets where is_sample;
delete from public.proposals where is_sample;
delete from public.campaigns where is_sample;
delete from public.departures where is_sample;
delete from public.media where is_sample;
delete from public.products where is_sample;
delete from public.agent_log where is_sample;
delete from public.notifications where is_sample;
delete from public.budget_plan where is_sample;

