# Operations Runbook

Full runbook (on-call, incident response, backup/restore, migration rollback
procedure) is populated in Phase 10. This section covers the local migration
workflow introduced in Phase 1.

## Migrations (local dev)

Migrations live in `supabase/migrations/`, numbered and forward-only —
tables, RLS policies, GRANTs, and helper functions together in the same file
per domain (see `references/database-schema.md`).

- **Fresh apply / re-apply from scratch**: `npx supabase db reset` — drops
  and recreates the local database, then applies every migration in order.
  Also runs automatically on a *fresh* `supabase start` (no existing Docker
  volume); on an existing volume, `supabase start` does NOT re-run
  already-recorded migrations even if you've edited their files locally —
  use `db reset` to force that.
- **Apply only pending migrations** (the CI/staging/prod path):
  `npx supabase migration up` — tracks applied versions in
  `supabase_migrations.schema_migrations`; a no-op if nothing is pending.
  Verified idempotent: running it twice in a row with nothing new applies
  zero migrations the second time.
- CI (`.github/workflows/ci.yml`) runs the real Supabase CLI local stack
  (`supabase start`), not a bare Postgres container — our migrations
  reference `auth.users`/`auth.jwt()`/`auth.uid()`, which only the Supabase
  stack provides.

Populated further in Phase 10 — on-call, incident response, backup/restore,
migration rollback procedure. Not yet started.
