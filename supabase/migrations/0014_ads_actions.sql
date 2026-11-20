-- Phase 2: changes made in Meta after a person approves a proposal. Nothing runs without an approval.
create table if not exists public.ads_actions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  proposal_id uuid references public.proposals(id) on delete set null,
  kind text not null,
  level text not null,
  entity_id uuid,
  meta_id text not null,
  entity_name text,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  ok boolean not null,
  error text,
  by_email text,
  undone_at timestamptz,
  undone_by_email text
);
create index if not exists ads_actions_proposal_idx on public.ads_actions (proposal_id);
alter table public.ads_actions enable row level security;
create policy "signed-in users can read ads actions" on public.ads_actions for select to authenticated using (true);
alter table public.proposals
  add column if not exists applied_at timestamptz,
  add column if not exists apply_note text;
