-- Correcting the four entry certificates.
--
-- GCC Lab's list, read properly this time:
--
--   1. Safe Working Procedures — Electrical or Mechanical, per the test
--   2. OHS General Induction          (NOT OHS Representative — my misreading)
--   3. Basic Fire Fighting — CSCC21   (CSCC24 is a duplicate, not a variant)
--   4. Basic First Aid — CSCC22
--
-- Two corrections follow, and the first one removes a requirement group
-- entirely rather than editing it.

-- ---------------------------------------------------------------------------
-- 1. Requirement 2 is the induction, which is already universal
-- ---------------------------------------------------------------------------

-- 0039/0040 read "OHS" as OHS Representative (CSCC13) and added it as its own
-- group. It is the OHS General Induction — which getPrerequisiteGroups()
-- already appends to EVERY course as its own group, precisely because SEC's
-- rule is that nobody trains at all without it.
--
-- So the requirement was already enforced, and the group added on top demanded
-- a second, unrelated qualification. Deleting it does not weaken the gate: the
-- induction group remains, and a technician still cannot sit a test without it
-- — src/tests/integration/test-entry-requirements.test.ts holds that case.
delete from course_prerequisites cp
using courses t, courses p
where cp.course_id = t.id
  and cp.prerequisite_course_id = p.id
  and t.code like 'CTCT%'
  and p.code = 'CSCC13'
  and cp.group_no = 2;

-- ---------------------------------------------------------------------------
-- 2. Basic Fire Fighting is CSCC21, and only CSCC21
-- ---------------------------------------------------------------------------

-- CSCC24 carries the identical title under contractor_category
-- 'Transmission'. 0039 treated the pair the way Safe Working Procedures is
-- genuinely split by category, and put both in one OR group. It is not a
-- category variant, it is a duplicate row — and CSCC21 is already
-- category-agnostic, so every company can see and hold it.
delete from course_prerequisites cp
using courses t, courses p
where cp.course_id = t.id
  and cp.prerequisite_course_id = p.id
  and t.code like 'CTCT%'
  and p.code = 'CSCC24';

-- Deactivated rather than deleted. Nothing has ever been certified, requested,
-- scheduled or uploaded against it — the only references were the prerequisite
-- rows removed above — but it still carries its own pricing, job role and
-- prerequisite from the seeded matrix. Deactivating takes it out of every
-- catalog and picker (listActiveCourses filters on active) while leaving the
-- row recoverable if the Transmission matrix turns out to want its own code.
update courses set active = false where code = 'CSCC24';

-- ---------------------------------------------------------------------------
-- 3. Close the gap the deletions left
-- ---------------------------------------------------------------------------

-- Group numbers only need to be distinct, so gaps are harmless to the gate.
-- They are not harmless to a person reading the table and wondering what
-- happened to group 2. Renumbered lowest-first so the shifts cannot collide.
update course_prerequisites cp set group_no = 2
  from courses t where cp.course_id = t.id and t.code like 'CTCT%' and cp.group_no = 3;
update course_prerequisites cp set group_no = 3
  from courses t where cp.course_id = t.id and t.code like 'CTCT%' and cp.group_no = 4;
update course_prerequisites cp set group_no = 4
  from courses t where cp.course_id = t.id and t.code like 'CTCT%' and cp.group_no = 5;

-- The four requirements a technical test now enforces:
--   group 1 (or 4, where the test listed no SWP) — Safe Working Procedures
--   group 2                                      — Basic Fire Fighting
--   group 3                                      — Basic First Aid
--   the induction group, added for every course  — OHS General Induction
