-- Cities were a hardcoded map in src/lib/regions.ts, so adding one meant a
-- code change and a deploy. Unlike the four regions — which are SEC's
-- Registration Sheet droplist and not GCC Lab's to invent — the city list is
-- GCC Lab's own training-institute footprint and will grow.
--
-- Regions deliberately stay a TS tuple: they feed z.enum() literal unions
-- across eight modules and six CHECK constraints, and nothing has asked for
-- a fifth region. Cities have exactly one consumer (the request wizard's
-- preferred-city select), whose Zod field is already a plain string, so
-- there is no type safety to lose here.
create table cities (
  -- Canonical English name, and the FK target below, so it matches the
  -- values 0028 already normalised training_requests.preferred_city to.
  name text primary key,
  region text not null check (region in ('Central', 'East', 'West', 'South')),
  -- Not null on purpose: a nullable Arabic name gets skipped at creation and
  -- then renders as English in the Arabic locale, which is how the course
  -- catalog ended up with English title_ar placeholders.
  name_ar text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cities_region_idx on cities (region);

alter table cities enable row level security;

grant select, insert, update, delete on cities to authenticated, service_role;

-- Readable by every signed-in user: contractors need it to populate the
-- preferred-city dropdown. Writable by super_admin only, under the existing
-- manage_catalog capability that already owns training_centers — mirrors
-- 0007_catalog.sql's training_centers policies exactly.
create policy cities_select_all on cities
  for select
  using (auth.role() = 'authenticated');

create policy cities_super_admin_write on cities
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

-- The four GCC Lab training institutes from HRBL_0004_FO_001's
-- "مكان تقديم الدورة" list — the same four the hardcoded map held.
insert into cities (name, region, name_ar) values
  ('Riyadh', 'Central', 'الرياض'),
  ('Dammam', 'East', 'الدمام'),
  ('Jeddah', 'West', 'جدة'),
  ('Abha', 'South', 'أبها');

-- Swap 0028's value CHECK for a real foreign key. Same guarantee, except it
-- now follows the table instead of needing a migration every time a city is
-- added. Seeding above happens first, so existing rows cannot violate it.
--
-- ON UPDATE CASCADE: renaming a city carries historical requests with it.
-- ON DELETE RESTRICT: a city with request history cannot be deleted, which
-- is why the table has `active` — deactivate instead.
alter table training_requests drop constraint training_requests_preferred_city_check;
alter table training_requests add constraint training_requests_preferred_city_fkey
  foreign key (preferred_city) references cities (name) on update cascade on delete restrict;
