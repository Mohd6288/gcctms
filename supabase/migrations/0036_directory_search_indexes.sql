-- The directory searches people by name across a roster this platform expects
-- to hold several thousand of, and the search is `ilike '%term%'` — a leading
-- wildcard, which no b-tree index can serve. At 3,000 rows the sequential scan
-- measured 16ms and nobody would notice; it grows linearly, and the first
-- person to notice is an auditor searching during an inspection.
--
-- pg_trgm indexes the trigrams inside a string, which is exactly what a
-- contains-match needs, and it is the extension Postgres ships for this.
create extension if not exists pg_trgm;

create index if not exists employees_full_name_en_trgm_idx on employees using gin (full_name_en gin_trgm_ops);
create index if not exists employees_full_name_ar_trgm_idx on employees using gin (full_name_ar gin_trgm_ops);
create index if not exists companies_name_trgm_idx on companies using gin (name gin_trgm_ops);

-- Searching by full Iqama goes through the deterministic HMAC, so it is an
-- equality lookup — already served by the unique index on national_id_hash.
-- Recorded here so nobody adds a second one for it.

-- The directory's default ordering, and the ordering every page of it uses.
create index if not exists employees_company_name_idx on employees (company_id, full_name_en);

-- The auditor's activity feed filters on actor, entity type and action, then
-- orders by time. audit_log already has (entity_type, entity_id), user_id and
-- created_at separately; this is the composite the filtered feed actually
-- scans.
create index if not exists audit_log_action_created_idx on audit_log (action, created_at desc);
