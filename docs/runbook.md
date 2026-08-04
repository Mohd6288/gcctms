# Operations Runbook

## Environments

| Env | Supabase project | Vercel | Status |
|---|---|---|---|
| local | `supabase start` (Docker) | `npm run dev` | dev workstation only |
| dev | `gcctms-dev` (`bupfgfbdcbhvmrqszndn`, `eu-central-1`, free tier) | Production deploys point here today (`https://gcctms.vercel.app`) | live |
| staging | `gcctms-staging` (`spodkchlifabfzdtbpxw`, `eu-central-1`, free tier) | not wired to a Vercel environment yet | schema-only, no app traffic |
| prod | not provisioned | — | deferred — see "Before onboarding a real company" below |

Deploying migrations to dev/staging: `gh workflow run deploy-migrations.yml -f environment=dev` (or `staging`) — see `docs/residency.md` for why this is manual dispatch rather than branch-triggered.

## Incident response

1. **Check it's real**: `npx vercel inspect <deployment-url>` or the Vercel dashboard's Runtime Logs / Errors for the `gcctms` project — most "the app is down" reports are a single bad deploy, not infra.
2. **App-level errors** (500s, exceptions): Vercel dashboard → project → Logs, filtered to the affected route. Server Actions and route handlers log via `console.error`; nothing structured yet (no Sentry/error-tracking service wired up — a real gap, see below).
3. **Database-level issues** (RLS denials, connection exhaustion, slow queries): Supabase dashboard → the affected project → Logs & Reports, or Database → Query Performance.
4. **Rollback a bad deploy**: Vercel dashboard → Deployments → find the last-known-good deployment → "Promote to Production". This does not touch the database — a bad deploy that only shipped app-code bugs is safe to roll back this way at any time.
5. **Rollback a bad migration**: see below — this is NOT a one-click operation, plan for it before you need it.

## Backup / restore

Supabase manages automatic daily backups on **paid** plans only (Pro+) — the free tier (what `gcctms-dev`/`gcctms-staging` are on today) has **no automatic backups**. Before real company data ever enters a project, that project must be on a paid plan with backups confirmed enabled (Supabase dashboard → Database → Backups).

Manual backup any time (works on free tier too): `npx supabase link --project-ref <ref> --password <pw>` then `npx supabase db dump -f backup.sql` — take one before any risky manual operation (a hand-run migration fix, a bulk data correction).

Restore: `psql <connection-string> < backup.sql` against a **fresh** project, never against the live one in place — always restore-and-verify-then-cutover, not restore-in-place.

## Migration rollback procedure

Migrations here are forward-only (see `database-schema.md`) — there is no `supabase migration down`. Rolling back a bad migration means writing a new forward migration that undoes it:

1. Identify the bad migration's number (e.g. `0023_bad_change.sql`).
2. Write `00XX_revert_bad_change.sql` that reverses it (drop the column/table/constraint it added, or re-add what it dropped).
3. Test against local `supabase start` first (`npx supabase db reset` to replay the full chain including the revert).
4. Deploy via `deploy-migrations.yml` same as any other migration.

If the bad migration already shipped data-destructive changes (a dropped column with real data in it), the forward-revert can restore the schema but not the lost data — that's what the backup above is for. Never hand-edit a migration file that's already been applied to any real environment; always add a new one.

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

## Phase 11 status (security review, load test)

Done:
- `npm audit --audit-level=high` is a real CI gate (was temporarily `|| true` in Phase 10) — the 3 high-severity advisories it originally caught (postcss, sharp, both via `next`) are cleared by the `next` 16.3.0 bump. One moderate advisory remains, accepted on purpose: `drizzle-kit`'s `esbuild` dependency, dev-tooling only, never shipped to users; fixing it means a breaking `drizzle-kit` downgrade, not worth it for a moderate, non-shipped issue.
- Git history checked clean of real secrets (only the well-known, identical-everywhere local `supabase start` demo key appears, which isn't sensitive).
- RLS policies audited for overly-permissive `using (true)` grants — one match, correctly scoped `to supabase_auth_admin` only (JWT claim minting at token issuance, not a user-facing role).
- GitHub secret scanning + push protection + Dependabot security updates enabled on the repo.
- Baseline security headers added (`next.config.ts`): HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, restrictive `Permissions-Policy`. **No CSP yet** — needs a real per-page verification pass (Supabase Storage signed-URL images, next/font) before adding one; don't add blind.
- Load test: `autocannon` against a local production build (`next start`) hitting the real `gcctms-dev` Supabase — both a static page and a real DB-backed query path (`/verify/:serial`) sustained ~1,500 req/s at p99 ~26ms with zero errors at 20 concurrent connections. Vercel's own bot/DDoS mitigation (`x-vercel-mitigated: challenge`) engaged automatically when the same tool was pointed at the live production URL instead of localhost — a positive finding (it's working), but it means load testing the live edge directly needs a real allowlisted testing setup, not naive `autocannon` from an arbitrary IP.
- These numbers comfortably exceed realistic load for a B2B contractor-training platform (expected: tens of concurrent users, not thousands) — no performance concerns for the traffic this system will actually see.

Known gaps, not blocking today (no real users yet) but required before real company data enters the system:
- **No error-tracking service** (Sentry or equivalent) — currently `console.error` only, visible in Vercel's Runtime Logs but nothing alerts anyone. Add before real users.
- **No uptime/alerting monitor** — nothing pages anyone if the site goes down. Add before real users (Vercel has a built-in Monitoring product, or a simple external uptime check).
- **No CSP** — see above.
- **Secrets that passed through a chat transcript during setup** (the `gcctms-dev` service_role key and the dev/staging DB passwords) should be rotated via the Supabase dashboard before any real data enters those projects — low urgency today since they're test-data-only projects, but don't carry them forward into prod.

## Before onboarding a real company (not done, deliberately deferred)

1. Provision a real **prod** Supabase project on a **paid** plan (backups, no auto-pause) — deferred past Phase 11 specifically to stay within the free-tier 2-project cap while dev+staging cover everything needed pre-launch. See `docs/residency.md` for the region (`eu-central-1`, already decided, must match dev/staging).
2. Point Vercel's Production environment variables at the new prod project instead of `gcctms-dev`.
3. Rotate the secrets noted above (don't carry dev-project credentials into a project that will hold anything close to real data — the actual prod project gets its own fresh credentials at creation anyway, so this is really about auditing that nothing dev-specific leaked into prod config).
4. Add error tracking + uptime alerting (see gaps above).
5. Decide on a custom domain (currently `gcctms.vercel.app`) — out of scope for this phase per an explicit earlier decision, revisit when actually onboarding.
6. Re-run this phase's security review and load test against the real prod project once it exists — the numbers here were measured against `gcctms-dev`, not prod infrastructure (though same region/tier, so not expected to differ materially).
