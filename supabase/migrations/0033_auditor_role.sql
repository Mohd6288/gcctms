-- A read-only, platform-wide oversight role: an auditor signs in, sees how
-- the certification process is actually running, and exports what they need.
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'platform_admin', 'contractor_manager', 'trainer', 'auditor'));

-- The other two role-shaped CHECKs already say "role <> 'contractor_manager'
-- => company_id is null" and the same for trainer_id, so an auditor is
-- covered by them without change: no company, no trainer.

-- Deliberately NO RLS policies for 'auditor' anywhere.
--
-- Every table already has RLS enabled with policies naming specific roles,
-- so a role with no policy reads nothing through the anon key / PostgREST.
-- That is the strictest possible stance and it is the one we want here:
-- auditors are the one role whose whole purpose is to look at everything, so
-- a direct-database path for them is the widest hole we could open, and it
-- would hand out columns the portal deliberately withholds — employees
-- .national_id_enc above all, since RLS is row-level and cannot mask a
-- column.
--
-- Instead every auditor read goes through server-rendered pages that select
-- named columns only (src/modules/audit/queries.ts), gated by
-- authorize("view_audit_portal") — the same trusted-server path the rest of
-- the app already uses, since Drizzle connects as the owner and bypasses RLS
-- regardless (see src/db/index.ts).
--
-- The practical consequence, stated so nobody rediscovers it as a bug: a
-- client-side Supabase query made as an auditor returns zero rows. That is
-- correct. If an auditor feature ever needs browser-side data, it needs a
-- server route, not a policy loosened here.

-- Storage is covered by the same reasoning: documents/certificates are
-- served only via getSignedDownloadUrl, whose assertCanTouchCompany accepts
-- platform_admin and contractor_manager and throws for anything else. An
-- auditor therefore sees that a document exists and whether it was verified,
-- and cannot pull the file — which is the masking decision applied to
-- identity scans as well as to Iqama numbers.
