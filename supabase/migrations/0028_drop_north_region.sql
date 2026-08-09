-- SEC's contractor matrix has four business areas, not five: the
-- Registration Sheet's "منطقة الاعمال التابع له المقاول" droplist lists
-- Western, Central, Southern and Eastern only, and the three GCC Lab price
-- workbooks cover the same four (Southern and Western sharing one sheet).
-- "North" was never in the source documents — it only ever existed as a
-- fifth entry in the hand-copied region tuple, and seeding it produced 43
-- pricing rows for a region no contractor can be in.
delete from pricing where region = 'North';

-- Two different kinds of column held 'North', and they deserve different
-- treatment.
--
-- These two are nullable *preferences*, where null already means "none
-- stated": a contractor's preferred region on a request, and the
-- scheduling board's not-yet-assigned pooling region. Since North was never
-- a real SEC area, "no preference" is the truthful value for them — and the
-- board assigns a real region downstream either way.
update training_requests set preferred_region = null where preferred_region = 'North';
update request_items set assigned_region = null where assigned_region = 'North';

-- These three are operational facts, not preferences: where a contractor
-- operates, where a class is actually being run, which region an admin
-- administers. There is no safe default for any of them, so fail loudly
-- rather than silently dropping a constraint that live rows would violate,
-- or silently blanking a location someone is relying on.
do $$
declare offending text;
begin
  select string_agg(t, ', ') into offending from (
    select 'companies' as t where exists (select 1 from companies where region = 'North')
    union all select 'classes' where exists (select 1 from classes where region = 'North')
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
--
-- It used to be a free-text input, so existing rows hold whatever was typed.
-- Fold the ones that are one of the four under different spacing or casing
-- onto the canonical spelling first — those are the same city, not new data.
update training_requests t
set preferred_city = c.canonical
from (values ('Riyadh'), ('Dammam'), ('Jeddah'), ('Abha')) as c(canonical)
where lower(btrim(t.preferred_city)) = lower(c.canonical) and t.preferred_city <> c.canonical;

-- Anything left names a city GCC Lab has no institute in, so it could never
-- have been honoured. Same reasoning as the region columns above: this is a
-- nullable preference, and null ("none stated") is truthful where the stated
-- value was never routable. The real venue is set on the class itself.
update training_requests
set preferred_city = null
where preferred_city is not null and preferred_city not in ('Riyadh', 'Dammam', 'Jeddah', 'Abha');

alter table training_requests drop constraint if exists training_requests_preferred_city_check;
alter table training_requests add constraint training_requests_preferred_city_check
  check (preferred_city is null or preferred_city in ('Riyadh', 'Dammam', 'Jeddah', 'Abha'));
