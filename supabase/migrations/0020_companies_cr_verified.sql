-- companies.cr_verified: a plain boolean a platform_admin can flip by hand,
-- with no attached evidence or document — matches the validated prototype's
-- Company.crVerified exactly (an "Edit Company" dialog control, explicitly
-- labeled GCC-Lab-admin-only). This is distinct from `status`, which tracks
-- registration/account state and stays deferred (see roles-and-workflows.md
-- Company & employee rules) — cr_verified is not deferred, only a future
-- *evidence-backed* verification workflow is.
alter table companies add column cr_verified boolean not null default true;
