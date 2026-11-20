-- Phase 3: a media library and campaign drafts.
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;
create policy "signed-in users can read media files" on storage.objects for select to authenticated using (bucket_id = 'media');
create policy "signed-in users can upload media files" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "signed-in users can remove media files" on storage.objects for delete to authenticated using (bucket_id = 'media');

alter table public.media
  add column if not exists destination_id uuid references public.destinations(id) on delete set null,
  add column if not exists uploaded_by_email text,
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists note text;
create index if not exists media_destination_idx on public.media (destination_id);

create table if not exists public.campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_email text,
  made_by text not null default 'person',
  destination_id uuid references public.destinations(id) on delete set null,
  source_campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  daily_budget numeric(12,2),
  objective text, audience text, placements text,
  primary_texts jsonb not null default '[]'::jsonb,
  headlines jsonb not null default '[]'::jsonb,
  media_ids jsonb not null default '[]'::jsonb,
  reasoning text,
  status text not null default 'draft' check (status in ('draft', 'created', 'discarded', 'failed')),
  meta_campaign_id text, result_note text, decided_by_email text, decided_at timestamptz, model text
);
create index if not exists campaign_drafts_destination_idx on public.campaign_drafts (destination_id);
create index if not exists campaign_drafts_source_idx on public.campaign_drafts (source_campaign_id);
alter table public.campaign_drafts enable row level security;
create policy "signed-in users have full access to campaign drafts" on public.campaign_drafts for all to authenticated using (true) with check (true);
