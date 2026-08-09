-- profiles.active was surfaced in the super_admin users screen and filtered
-- on in listPlatformAdmins, but nothing anywhere checked it at sign-in or in
-- getContext(). Deactivating an account did precisely nothing: the user kept
-- signing in and kept every permission they had.
--
-- That matters now that accounts are handed out in batches for testing —
-- being able to grant access without being able to revoke it is the wrong
-- half of the pair.
--
-- Enforced at token issuance rather than in app code: withholding the
-- user_role claim means auth_role() is null, so getContext() returns null,
-- requireRole() bounces them, AND every RLS policy keyed on auth_role()
-- stops matching. One change, enforced in the database, no code path can
-- forget it. The company_id/trainer_id/region claims go with it — they are
-- meaningless without a role.
create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  profile_role text;
  profile_company_id bigint;
  profile_trainer_id bigint;
  profile_active boolean;
  assigned_region text;
begin
  select role, company_id, trainer_id, active
    into profile_role, profile_company_id, profile_trainer_id, profile_active
    from public.profiles
    where user_id = (event->>'user_id')::uuid;

  select region into assigned_region
    from public.regional_admin_assignments
    where admin_user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- An inactive profile is issued a token with no role, so it authenticates
  -- but authorizes as nobody.
  if profile_role is not null and coalesce(profile_active, true) then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(profile_role));

    if profile_company_id is not null then
      claims := jsonb_set(claims, '{company_id}', to_jsonb(profile_company_id));
    end if;
    if profile_trainer_id is not null then
      claims := jsonb_set(claims, '{trainer_id}', to_jsonb(profile_trainer_id));
    end if;
    if assigned_region is not null then
      claims := jsonb_set(claims, '{region}', to_jsonb(assigned_region));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
