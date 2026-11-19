-- Marks the owner account. Everyone still has full access in the app;
-- this flag is for display and for future owner-only settings.
alter table public.profiles add column is_superadmin boolean not null default false;
comment on column public.profiles.is_superadmin is 'Marks the owner account. Everyone still has full access in the app; this flag is for display and for future owner-only settings.';
