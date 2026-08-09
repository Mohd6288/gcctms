-- SEC's contractor matrix has four business areas, not five: the
-- Registration Sheet's "منطقة الاعمال التابع له المقاول" droplist lists
-- Western, Central, Southern and Eastern only, and the three GCC Lab price
-- workbooks cover the same four (Southern and Western sharing one sheet).
-- "North" was never in the source documents — it only ever existed as a
-- fifth entry in the hand-copied region tuple, and seeding it produced 43
-- pricing rows for a region no contractor can be in.
delete from pricing where region = 'North';

-- Fail loudly rather than silently dropping a constraint that live rows
-- would then violate. Nothing but pricing referenced 'North' when this was
-- written; if a later environment has one, it needs a decision, not a
-- default.
do $$
declare offending text;
begin
  select string_agg(t, ', ') into offending from (
    select 'companies' as t where exists (select 1 from companies where region = 'North')
    union all select 'classes' where exists (select 1 from classes where region = 'North')
    union all select 'training_requests' where exists (select 1 from training_requests where preferred_region = 'North')
    union all select 'request_items' where exists (select 1 from request_items where assigned_region = 'North')
    union all select 'regional_admin_assignments' where exists (select 1 from regional_admin_assignments where region = 'North')
  ) s;
  if offending is not null then
    raise exception 'Rows still reference the North region in: %. Reassign them before applying this migration.', offending;
  end if;
end $$;

alter table companies drop constraint companies_region_check;
alter table companies add constraint companies_region_check
  check (region is null or region in ('Central', 'East', 'West', 'South'));

alter table pricing drop constraint pricing_region_check;
alter table pricing add constraint pricing_region_check
  check (region is null or region in ('Central', 'East', 'West', 'South'));

alter table training_requests drop constraint training_requests_preferred_region_check;
alter table training_requests add constraint training_requests_preferred_region_check
  check (preferred_region is null or preferred_region in ('Central', 'East', 'West', 'South'));

alter table request_items drop constraint request_items_assigned_region_check;
alter table request_items add constraint request_items_assigned_region_check
  check (assigned_region is null or assigned_region in ('Central', 'East', 'West', 'South'));

alter table classes drop constraint classes_region_check;
alter table classes add constraint classes_region_check
  check (region in ('Central', 'East', 'West', 'South'));

alter table regional_admin_assignments drop constraint regional_admin_assignments_region_check;
alter table regional_admin_assignments add constraint regional_admin_assignments_region_check
  check (region in ('Central', 'East', 'West', 'South'));

-- Training requests carry a preferred city; constrain it to the four GCC Lab
-- institute cities (HRBL_0004_FO_001's "مكان تقديم الدورة" list) so a typo
-- can't route a request to a city that has no institute.
alter table training_requests add constraint training_requests_preferred_city_check
  check (preferred_city is null or preferred_city in ('Riyadh', 'Dammam', 'Jeddah', 'Abha'));
