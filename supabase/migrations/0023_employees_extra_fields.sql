-- Matches the validated prototype's Employee model (EmployeeFormDialog.tsx),
-- which the real Registration Sheet / HRBL request form templates also
-- capture: nationality, activity (type of work), and the contractor's own
-- area/city (distinct from the training's preferred region/city on the
-- request itself). All nullable — optional at the DB level, required by the
-- app's own validation where the source document actually requires them.
alter table employees
  add column nationality text,
  add column activity text,
  add column contractor_area text,
  add column contractor_city text;
