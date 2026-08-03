-- Custom Access Token Hook: injects role/company_id/trainer_id from
-- public.profiles into a custom "user_role" JWT claim (never the top-level
-- "role" claim — Supabase reserves that for authenticated|anon|service_role)
-- at every token issuance. auth_role()/auth_company_id()/auth_trainer_id()
-- (0001_helpers.sql) read these claims back out for every RLS policy.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  profile_role text;
  profile_company_id bigint;
  profile_trainer_id bigint;
begin
  select role, company_id, trainer_id
    into profile_role, profile_company_id, profile_trainer_id
    from public.profiles
    where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if profile_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(profile_role));
  end if;
  if profile_company_id is not null then
    claims := jsonb_set(claims, '{company_id}', to_jsonb(profile_company_id));
  end if;
  if profile_trainer_id is not null then
    claims := jsonb_set(claims, '{trainer_id}', to_jsonb(profile_trainer_id));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- supabase_auth_admin (GoTrue's own Postgres role, not "authenticated") is
-- the only role allowed to invoke this — it runs at token issuance, before
-- the user has any session at all.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.profiles to supabase_auth_admin;

create policy profiles_auth_admin_select on public.profiles
  as permissive for select
  to supabase_auth_admin
  using (true);
