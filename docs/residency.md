# Hosting & Data Residency Decision

## Decision (Phase 0)

**Default: Vercel + Supabase**, per `references/architecture.md`'s Track B recommendation — Next.js App Router deployed on Vercel (SOC 2 Type II + ISO 27001), Supabase Postgres + Auth + Storage (SOC 2 Type II + ISO 27001, HIPAA-capable). This is the primary track for this build.

## Region — not yet finalized

No live Supabase project has been provisioned yet (Phase 0 only stands up **local** Supabase via `supabase start`, which is region-agnostic — see `supabase/config.toml`). The region is chosen **once, at Supabase project creation**, and data + backups stay in that region for the life of the project (changing region later means a new project + migration, not a config flip).

**Action needed before Phase 1 creates a real dev Supabase project**: confirm whether PDPL (Saudi Personal Data Protection Law) or SEC contractual terms mandate in-Kingdom / in-region data residency for this system, given it processes contractor Iqama numbers (`employees.national_id_hash`/`national_id_enc`) and SEC-facility-related records. If yes → see the residency variant below. If no → default to a Vercel-adjacent Supabase region (e.g. closest to Saudi Arabia with acceptable latency) and record the specific region here once chosen.

## Residency variant (if PDPL/in-Kingdom is mandated)

Per `architecture.md`: **AWS in a Middle East region** — Bahrain (`me-south-1`) or UAE (`me-central-1`) — or a local sovereign cloud option (Google Cloud Dammam, STC Cloud), optionally with **self-hosted Supabase** (Postgres + GoTrue + Storage run on that infrastructure instead of Supabase's managed cloud). This is a materially larger operational lift (self-managed backups, upgrades, monitoring) than the managed Vercel+Supabase default — only take this path if actually required, not preemptively.

## Environments

Three Supabase projects (dev / staging / prod), Git-branch-driven:
- `dev` branch → Vercel preview deployments + dev Supabase project
- `staging` branch → staging Vercel environment + staging Supabase project
- `main` branch → production Vercel deployment + prod Supabase project

Migrations are applied by CI to dev → staging → prod, in that order, never hand-edited on a remote project (see `database-schema.md`'s Migration rules).

## Status

- [x] Framework/platform decision (Vercel + Supabase) — Phase 0
- [ ] PDPL/in-Kingdom requirement confirmed with the business — **blocks the next item**
- [ ] Supabase region chosen and dev project created — Phase 1 kickoff
- [ ] Staging + prod Supabase projects created — Phase 10
