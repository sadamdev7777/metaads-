-- Sample rows for Phase 0. Every sample row has is_sample = true so it can be removed
-- in one go before real data is loaded:  delete from <table> where is_sample;

insert into public.products (travelcrm_id, name, country, deposit_per_pax, landing_page_url, is_sample) values
  ('sample-korea-winter', 'Korea Winter', 'Korea', 500, '/korea-winter', true),
  ('sample-korea-spring', 'Korea Spring', 'Korea', 500, '/korea-spring', true),
  ('sample-korea-autumn', 'Korea Autumn', 'Korea', 500, '/korea-autumn', true),
  ('sample-kk-kundasang', 'KK Kundasang', 'Malaysia', 200, '/kk-kundasang', true),
  ('sample-japan-osaka-tokyo', 'Japan Osaka Tokyo', 'Japan', 500, '/japan-osaka-tokyo', true),
  ('sample-turkiye', 'Turkiye', 'Turkiye', 800, '/turkiye', true),
  ('sample-danang', 'Danang', 'Vietnam', 300, '/danang', true),
  ('sample-bandung', 'Bandung', 'Indonesia', 300, null, true);

insert into public.departures (product_id, departure_date, seats_total, seats_filled, is_sample)
select p.id, d.dt, 40, d.filled, true
from public.products p
join (values ('2027-01-12'::date, 28), ('2027-01-26'::date, 22), ('2027-02-09'::date, 31), ('2027-02-23'::date, 40)) as d(dt, filled)
  on p.travelcrm_id = 'sample-korea-winter';

with spec(tid, n, open_seats, start_date) as (values
  ('sample-korea-spring', 5, 62, '2027-03-10'::date),
  ('sample-korea-autumn', 3, 44, '2027-09-15'::date),
  ('sample-kk-kundasang', 6, 48, '2027-01-08'::date),
  ('sample-japan-osaka-tokyo', 3, 35, '2027-01-20'::date),
  ('sample-turkiye', 3, 70, '2027-02-05'::date),
  ('sample-danang', 4, 88, '2027-01-15'::date),
  ('sample-bandung', 4, 60, '2027-01-22'::date))
insert into public.departures (product_id, departure_date, seats_total, seats_filled, is_sample)
select p.id, s.start_date + (g.i * 14), 40,
       ((s.n * 40 - s.open_seats) / s.n) + case when g.i < ((s.n * 40 - s.open_seats) % s.n) then 1 else 0 end,
       true
from spec s
join public.products p on p.travelcrm_id = s.tid
cross join lateral generate_series(0, s.n - 1) as g(i);

insert into public.campaigns (name, product_id, run_by, source, utm, delivery_status, daily_budget, is_sample)
select c.name, p.id, c.run_by, c.source, c.utm, c.delivery, c.budget, true
from (values
  ('Korea Autumn 20/11 - AI', 'sample-korea-autumn', 'AI', 'system', 'korea-autumn-2011-ai', 'draft', 100),
  ('Korea Spring 3/10 - AI', 'sample-korea-spring', 'AI', 'system', 'korea-spring-0310-ai', 'delivering', 200),
  ('KK Kundasang 23/9 - Staff B', 'sample-kk-kundasang', 'Staff B', 'meta', 'kk-kundasang-2309', 'delivering', 120),
  ('Japan 24/9 - Staff A', 'sample-japan-osaka-tokyo', 'Staff A', 'meta', 'japan-2409', 'learning', 300),
  ('Korea Winter 5/10 - Staff A', 'sample-korea-winter', 'Staff A', 'meta', 'korea-winter-0510', 'delivering', 850),
  ('Turkiye 12/10 - AI', 'sample-turkiye', 'AI', 'system', 'turkiye-1210-ai', 'has_issues', 290),
  ('Turkiye 28/9 - Staff A', 'sample-turkiye', 'Staff A', 'meta', 'turkiye-2809', 'delivering', 330),
  ('Danang 17/9 - Staff B', 'sample-danang', 'Staff B', 'meta', 'danang-1709', 'delivering', 220)
) as c(name, tid, run_by, source, utm, delivery, budget)
join public.products p on p.travelcrm_id = c.tid;

insert into public.rules (id) values (1);

insert into public.budget_plan (month, country, planned, is_sample) values
  ('2026-11-01', 'Korea', 40000, true),
  ('2026-11-01', 'Japan', 18000, true),
  ('2026-11-01', 'Turkiye', 14000, true),
  ('2026-11-01', 'Malaysia', 12000, true),
  ('2026-11-01', 'Vietnam', 10000, true),
  ('2026-11-01', 'Indonesia', 6000, true);

-- Real status of every connection at the end of Phase 0: none are set up yet.
insert into public.integration_status (key, name, used_for, status, detail) values
  ('travelcrm', 'TravelCRM', 'Products, dates, seats and deposits.', 'not_set_up', 'Waiting for the TravelCRM MCP to be installed. Phase 1.'),
  ('meta_ads', 'Meta Ads', 'Campaigns, spend, and launching or changing ads.', 'not_set_up', 'Not connected to this system yet. Phase 1 reads, Phase 2 writes.'),
  ('website_form', 'MTB website form', 'Leads with the product picked and the campaign UTM.', 'not_set_up', 'How the system reads form data is not confirmed yet. Phase 1.'),
  ('whatsapp', 'WhatsApp', 'Daily report and approval messages.', 'not_set_up', 'Sending channel not chosen yet. Phase 4.'),
  ('meta_capi', 'Meta Conversions API', 'Sends deposits back to Meta so it learns who pays.', 'not_set_up', 'Phase 4.'),
  ('mailgun', 'Mailgun', 'Email to leads that did not close.', 'not_set_up', 'Planned for later, replaces Brevo.');
