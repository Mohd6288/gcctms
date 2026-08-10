# Hosting & Data Residency Decision

## Decision (Phase 0)

**Default: Vercel + Supabase**, per `references/architecture.md`'s Track B recommendation — Next.js App Router deployed on Vercel (SOC 2 Type II + ISO 27001), Supabase Postgres + Auth + Storage (SOC 2 Type II + ISO 27001, HIPAA-capable). This is the primary track for this build.

## Region — decided (Phase 10)

**Confirmed with the business: no PDPL/SEC in-Kingdom residency mandate.** Managed Vercel + Supabase, region chosen for lowest latency to Saudi Arabia, applies to all three environments (dev/staging/prod) — Supabase has no Middle East region in its managed offering (`supabase projects create --region` choices: `ap-east-1, ap-northeast-1, ap-northeast-2, ap-south-1, ap-southeast-1, ap-southeast-2, ca-central-1, eu-central-1, eu-central-2, eu-north-1, eu-west-1, eu-west-2, eu-west-3, sa-east-1, us-east-1, us-east-2, us-west-1, us-west-2`), so the residency variant below doesn't apply.

**Region: `eu-central-1` (Frankfurt)** — closer to Saudi Arabia than the only other plausible candidate (`ap-south-1`/Mumbai) via standard European backbone routing, and the conventional default for MENA-adjacent deployments. Used for dev, staging, and prod. The region is chosen **once, at Supabase project creation**, and data + backups stay there for the life of the project (changing region later means a new project + full re-migration, not a config flip) — so staging/prod must reuse this same region, not be re-decided later.

## Re-confirmed 10 August 2026

Re-confirmed by the business: **hosting outside the Kingdom is acceptable**, so
`eu-central-1` stands and the prod project is created there alongside dev.

Re-asked because the material facts changed after Phase 10: the platform now
holds real people's data (13 named trainers with personal emails and phone
numbers, and shortly a client's employees with Iqama numbers), where the
original decision was taken while everything was test data. The answer is the
same; it is recorded again here so the record shows it was reconsidered
against the data that actually exists rather than carried forward by default.

Location is settled. PDPL's other obligations are not a hosting question and
still apply wherever the data sits — retention, subject-access, breach
notification, and the legal basis for transferring personal data abroad. Those
belong with GCC Lab's legal side, not with this decision.

## Residency variant (if PDPL/in-Kingdom is mandated)

Per `architecture.md`: **AWS in a Middle East region** — Bahrain (`me-south-1`) or UAE (`me-central-1`) — or a local sovereign cloud option (Google Cloud Dammam, STC Cloud), optionally with **self-hosted Supabase** (Postgres + GoTrue + Storage run on that infrastructure instead of Supabase's managed cloud). This is a materially larger operational lift (self-managed backups, upgrades, monitoring) than the managed Vercel+Supabase default — only take this path if actually required, not preemptively.

## Environments

Three Supabase projects (dev / staging / prod) — **not** Git-branch-driven, revised in Phase 10 from the original Phase 0 plan. All work happens on a single `main` branch in practice (no `dev`/`staging` branches have ever existed in this repo), so environment promotion is a deliberate, manually-triggered action rather than implicit in which branch you pushed to:

```
gh workflow run deploy-migrations.yml -f environment=dev
gh workflow run deploy-migrations.yml -f environment=staging
gh workflow run deploy-migrations.yml -f environment=prod
```

Each run links to that environment's Supabase project (via a GitHub Environment named `dev`/`staging`/`prod`, holding that project's `SUPABASE_PROJECT_REF` var + `SUPABASE_DB_PASSWORD` secret) and pushes the current migration chain — never hand-edited on a remote project (see `database-schema.md`'s Migration rules). Vercel deployment is separate: connect the GitHub repo in the Vercel dashboard once, and every push to `main` deploys to production automatically via Vercel's own Git integration — no custom deploy workflow needed for the app itself, only for Supabase migrations, which Vercel doesn't know how to run.

## Status

- [x] Framework/platform decision (Vercel + Supabase) — Phase 0
- [x] PDPL/in-Kingdom requirement confirmed with the business — no mandate (re-confirmed 10 Aug 2026, now that real personal data is involved)
- [x] Supabase region chosen (`eu-central-1`) — Phase 10
- [x] Dev Supabase project created (`gcctms-dev`) — Phase 10
- [x] Staging Supabase project created (`gcctms-staging`) — Phase 10
- [ ] Prod Supabase project — deferred to Phase 11 (launch), stays within the free-tier 2-project cap until then
- [ ] Vercel project connected to the repo, env vars set per environment — Phase 10
