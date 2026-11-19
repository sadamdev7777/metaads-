-- Secrets for integrations (for example the Meta access token) are kept in Supabase Vault, encrypted.
-- They are written and read only by Edge Functions using the service role. The browser can never read them back.

alter table public.integration_status
  add column config jsonb not null default '{}'::jsonb,
  add column secret_hint text,
  add column updated_by_email text;

create function public.set_integration_secret(p_name text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = p_name;
  if sid is null then
    perform vault.create_secret(p_secret, p_name);
  else
    perform vault.update_secret(sid, p_secret);
  end if;
end $$;

create function public.get_integration_secret(p_name text) returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

revoke execute on function public.set_integration_secret(text, text) from public, anon, authenticated;
revoke execute on function public.get_integration_secret(text) from public, anon, authenticated;
grant execute on function public.set_integration_secret(text, text) to service_role;
grant execute on function public.get_integration_secret(text) to service_role;
