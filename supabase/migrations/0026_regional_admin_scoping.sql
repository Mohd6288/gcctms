-- Phase 5: regional admin scoping. A platform_admin assigned a region (via
-- regional_admin_assignments, previously unused scaffolding from
-- 0011_scheduling.sql) sees only that region's companies/employees/
-- requests/documents/payments/classes; an UNASSIGNED platform_admin keeps
-- today's behavior (sees everything) — assigning a region is what narrows
-- access, not the other way around, so existing/new admin accounts aren't
-- silently locked out until someone explicitly assigns them.
--
-- One region per admin: regional_admin_assignments.region was already a
-- primary key (at most one admin per region); this adds the mirror
-- constraint (at most one region per admin) to make it a real 1:1 mapping,
-- since the JWT carries a single "region" claim, not an array.
alter table regional_admin_assignments add constraint regional_admin_assignments_admin_user_id_key unique (admin_user_id);

create or replace function auth_region() returns text
language sql stable
as $$
  select nullif(auth.jwt()->>'region', '')
$$;

grant execute on function auth_region() to authenticated;

-- The hook runs as supabase_auth_admin (see 0015_custom_access_token_hook.sql)
-- and now also reads regional_admin_assignments — without this grant+policy
-- pair (mirroring profiles_auth_admin_select exactly), that read fails,
-- which breaks token issuance for every user, not just platform_admin ones.
grant select on public.regional_admin_assignments to supabase_auth_admin;

create policy regional_admin_assignments_auth_admin_select on public.regional_admin_assignments
  as permissive for select
  to supabase_auth_admin
  using (true);

-- Mirrors auth_company_id()/auth_trainer_id()'s pattern exactly (see
-- 0015_custom_access_token_hook.sql) — looks up the admin's assigned region
-- (if any) and adds it as a "region" claim at token issuance.
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
  assigned_region text;
begin
  select role, company_id, trainer_id
    into profile_role, profile_company_id, profile_trainer_id
    from public.profiles
    where user_id = (event->>'user_id')::uuid;

  select region into assigned_region
    from public.regional_admin_assignments
    where admin_user_id = (event->>'user_id')::uuid;

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
  if assigned_region is not null then
    claims := jsonb_set(claims, '{region}', to_jsonb(assigned_region));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- ---- RLS: scope every platform_admin "all" policy by region ----
-- Pattern throughout: auth_region() is null (unassigned) => unrestricted,
-- same as today; otherwise the row's region (direct column, or the owning
-- company's region via a join) must match.

drop policy companies_platform_admin_all on companies;
create policy companies_platform_admin_all on companies
  for all
  using (auth_role() = 'platform_admin' and (auth_region() is null or region = auth_region()))
  with check (auth_role() = 'platform_admin' and (auth_region() is null or region = auth_region()));

drop policy employees_platform_admin_all on employees;
create policy employees_platform_admin_all on employees
  for all
  using (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = employees.company_id and c.region = auth_region()
    ))
  )
  with check (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = employees.company_id and c.region = auth_region()
    ))
  );

drop policy training_requests_platform_admin_all on training_requests;
create policy training_requests_platform_admin_all on training_requests
  for all
  using (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = training_requests.company_id and c.region = auth_region()
    ))
  )
  with check (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = training_requests.company_id and c.region = auth_region()
    ))
  );

drop policy request_items_platform_admin_all on request_items;
create policy request_items_platform_admin_all on request_items
  for all
  using (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from training_requests tr
      join companies c on c.id = tr.company_id
      where tr.id = request_items.request_id and c.region = auth_region()
    ))
  )
  with check (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from training_requests tr
      join companies c on c.id = tr.company_id
      where tr.id = request_items.request_id and c.region = auth_region()
    ))
  );

drop policy documents_platform_admin_all on documents;
create policy documents_platform_admin_all on documents
  for all
  using (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = documents.company_id and c.region = auth_region()
    ))
  )
  with check (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from companies c where c.id = documents.company_id and c.region = auth_region()
    ))
  );

drop policy payments_platform_admin_all on payments;
create policy payments_platform_admin_all on payments
  for all
  using (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from training_requests tr
      join companies c on c.id = tr.company_id
      where tr.id = payments.request_id and c.region = auth_region()
    ))
  )
  with check (
    auth_role() = 'platform_admin'
    and (auth_region() is null or exists (
      select 1 from training_requests tr
      join companies c on c.id = tr.company_id
      where tr.id = payments.request_id and c.region = auth_region()
    ))
  );

-- classes.region is the class's own delivery region (may differ from the
-- attending company's registered region) — scoped directly, no join.
drop policy classes_platform_admin_all on classes;
create policy classes_platform_admin_all on classes
  for all
  using (auth_role() = 'platform_admin' and (auth_region() is null or region = auth_region()))
  with check (auth_role() = 'platform_admin' and (auth_region() is null or region = auth_region()));
