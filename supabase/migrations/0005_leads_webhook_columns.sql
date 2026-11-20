-- Extra detail kept for each lead that arrives through the website form webhook.
alter table public.leads
  add column product_name text,
  add column utm_params jsonb,
  add column source text not null default 'website_form';
