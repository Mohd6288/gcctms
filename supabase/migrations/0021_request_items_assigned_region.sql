-- The validated prototype's scheduling board has a two-step flow: an
-- eligible employee is first dragged into one of the 5 fixed regions (a
-- pooling/planning step, before any specific class/trainer/date exists),
-- and only later enrolled into an actual class in that region. There's no
-- dedicated table for that intermediate "assigned to a region, no class
-- yet" state — request_items already ties employee+request+course
-- together, so the region assignment lives there as a nullable column
-- rather than inventing a new entity. Once the employee is enrolled into a
-- specific class, a class_enrollments row exists and effectively
-- supersedes this — "in the pool" = no class_enrollments row yet for this
-- request_item.
alter table request_items add column assigned_region text
  check (assigned_region is null or assigned_region in ('North', 'South', 'East', 'West', 'Central'));
