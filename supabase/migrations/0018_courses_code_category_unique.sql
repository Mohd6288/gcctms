-- Fix: courses.code was modeled as globally unique (0007_catalog.sql), but
-- real GCC Lab source data has the same code appear twice — once per
-- contractor_category (e.g. CSCC10, CTCT01) — with different prerequisites,
-- eligible job roles, and occasionally duration under each. A code can have
-- at most one row per contractor_category, plus at most one category-
-- agnostic (null) row.
--
-- Two partial unique indexes instead of one plain unique(code,
-- contractor_category) constraint: Postgres never treats two NULLs as equal
-- in a unique constraint, so a plain composite constraint would silently
-- allow duplicate null-category rows for the same code.
alter table courses drop constraint courses_code_key;

create unique index courses_code_category_key on courses (code, contractor_category)
  where contractor_category is not null;

create unique index courses_code_null_category_key on courses (code)
  where contractor_category is null;
