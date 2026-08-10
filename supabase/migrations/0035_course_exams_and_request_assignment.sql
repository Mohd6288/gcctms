-- Two unrelated-looking changes that share a migration because both touch the
-- shape of a request's life: exams stop being their own thing, and a request
-- starts belonging to somebody.

-- 1. The pass mark moves onto the course.
--
-- `exams` existed to hold a code, a title and a pass mark, and a course
-- pointed at one. In practice nothing ever pointed: 0 exams, 0 exam results,
-- 0 linked courses. Worse, the pass mark was never enforced — setExamResult
-- took `result` straight from a Pass/Fail button the trainer pressed and never
-- compared `score` against it, so a 40 could be filed as a pass on a 70 exam.
--
-- A course now says whether it is examined and at what mark, and the result is
-- derived from the score in delivery/service.ts. There is nothing left for a
-- separate entity to hold.
alter table courses add column exam_required boolean not null default false;
alter table courses add column pass_mark int;

-- Backfill before anything is dropped. A no-op on dev; local and test
-- databases have rows from the delivery/certification suites.
update courses c
   set exam_required = true,
       pass_mark = e.pass_mark
  from exams e
 where e.id = c.exam_id;

alter table courses add constraint courses_pass_mark_shape
  check ((exam_required and pass_mark is not null and pass_mark between 0 and 100)
         or (not exam_required and pass_mark is null));

-- The result already carries score/result/attempt; which exam row it pointed
-- at stops meaning anything once the exam is the course's own setting.
alter table exam_results drop column exam_id;

alter table courses drop column exam_id;
drop table exams;

-- 2. A request belongs to an admin.
--
-- Region scoping decides who may SEE a request. It never decided who is doing
-- it, so with several admins in a region two could work the same one, or all
-- three could assume somebody else had.
--
-- Nullable on purpose: a region with nobody assigned to it must not block
-- submission. Unassigned is a real state that the queue shows plainly, not an
-- error. No foreign key onto profiles for the same reason the rest of the
-- schema avoids it — this is an auth.users id, and profiles is the bridge.
alter table training_requests add column assigned_admin_user_id uuid
  references auth.users (id) on delete set null;

create index training_requests_assigned_admin_idx
  on training_requests (assigned_admin_user_id);

comment on column training_requests.assigned_admin_user_id is
  'The platform_admin doing this request. Set on submit from the least-loaded admin in the company region (requests/assignment.ts); null when the region has no admin assigned. Ownership only — visibility is still region scoping.';
