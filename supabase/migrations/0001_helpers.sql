-- Phase 1: JWT-claim helper functions used by every RLS policy below.
-- Claims are copied into a custom "user_role" claim (never the top-level
-- "role" claim, which Supabase reserves for authenticated|anon|service_role)
-- by the auth hook wired in Phase 2. These functions just read whatever is
-- already on the current request's JWT.

create or replace function auth_role() returns text
language sql stable
as $$
  select coalesce(auth.jwt()->>'user_role', '')
$$;

create or replace function auth_company_id() returns bigint
language sql stable
as $$
  select nullif(auth.jwt()->>'company_id', '')::bigint
$$;

create or replace function auth_trainer_id() returns bigint
language sql stable
as $$
  select nullif(auth.jwt()->>'trainer_id', '')::bigint
$$;

grant execute on function auth_role() to authenticated;
grant execute on function auth_company_id() to authenticated;
grant execute on function auth_trainer_id() to authenticated;
