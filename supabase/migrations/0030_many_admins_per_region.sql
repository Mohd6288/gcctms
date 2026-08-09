-- regional_admin_assignments was keyed on region (0011_scheduling.sql), so
-- the table could hold at most one row per region — a hard ceiling of four
-- regional admins for the whole platform. Assigning a fifth admin, or two
-- admins to Central, was impossible by construction.
--
-- The relationship is really many admins to one region, so the key belongs
-- on the admin. Nothing downstream changes: custom_access_token_hook and
-- auth_region() both look a user's region up by admin_user_id
-- (0026_regional_admin_scoping.sql), so each admin still resolves to
-- exactly one region and all eight region-scoped RLS policies keep working
-- untouched.

-- setAdminRegion cleared an assignment by nulling admin_user_id rather than
-- deleting the row, so the table can hold orphans that would block the
-- not-null below.
delete from regional_admin_assignments where admin_user_id is null;

alter table regional_admin_assignments drop constraint regional_admin_assignments_pkey;
alter table regional_admin_assignments drop constraint regional_admin_assignments_admin_user_id_key;

alter table regional_admin_assignments alter column admin_user_id set not null;
alter table regional_admin_assignments add primary key (admin_user_id);

-- Region is no longer a key, so it keeps only its value constraint. 0011
-- wrote the pre-0028 five-region list; bring it in line with the four real
-- SEC business areas while the constraint is being touched anyway.
alter table regional_admin_assignments drop constraint regional_admin_assignments_region_check;
alter table regional_admin_assignments add constraint regional_admin_assignments_region_check
  check (region in ('Central', 'East', 'West', 'South'));

create index regional_admin_assignments_region_idx on regional_admin_assignments (region);

-- Deleting an auth user previously wedged on this FK's ON DELETE RESTRICT,
-- with no way to clear the assignment except by hand. An assignment has no
-- meaning without its admin.
alter table regional_admin_assignments drop constraint regional_admin_assignments_admin_user_id_fkey;
alter table regional_admin_assignments add constraint regional_admin_assignments_admin_user_id_fkey
  foreign key (admin_user_id) references auth.users (id) on delete cascade;
