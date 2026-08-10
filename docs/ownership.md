# Ownership and account handover

## The problem this document solves

Every account this platform runs on is currently a personal one:

| Layer | Account today | Should be |
| --- | --- | --- |
| Source code | `github.com/Mohd6288/gcctms` (personal) | GCC Lab GitHub organisation |
| Hosting | Vercel scope `mohd6288's projects`, Hobby | GCC Lab Vercel team, Pro |
| Database | Supabase org `Mohd6288's Org` (dev + staging) | GCC Lab Supabase organisation |
| Email sending | Resend, via the personal Vercel scope | same integration, company scope |
| Error tracking | Sentry, via the personal Vercel scope | same integration, company scope |
| Billing | a personal payment method | company payment method |

That arrangement is normal while one person is building. It stops being
acceptable the day real contractors' data is in it, for four separate reasons:

1. **The company cannot get its own system back without you.** Not a trust
   question — a bus-factor one. If your accounts are lost, locked, or you
   change employer, GCC Lab has no path to its own production database.
2. **PDPL.** GCC Lab is the data controller for Iqama numbers, identity scans
   and certificates. The infrastructure holding them sits under a private
   individual's account and payment card. The controller cannot demonstrate
   control it does not have.
3. **SEC is the ultimate audience.** A certification platform operated on a
   personal Hobby account is not a defensible answer to a client audit.
4. **The Hobby plan is already costing the product something real.** It is
   also, by Vercel's plan terms, for non-commercial use — confirm on the
   pricing page before launch.

On (4), a measured example rather than a theoretical one: Vercel rejected the
`*/5 * * * *` cron schedule this platform wants and accepted only a daily one,
which is why `vercel.json` currently runs the job queue once at 03:00. Until
that moves to Pro, **a notification email can sit in the queue for up to 24
hours** before it is sent. Nothing in the code needs to change to fix it —
only the plan.

## Do this before production exists, not after

The production Supabase project has not been created yet. That makes now the
cheapest possible moment: there is no live data to migrate, no DNS cutover, no
users to notify. Every week of delay makes this a bigger job.

**Order matters** — Vercel connects to GitHub through an app installed per
account, so moving the repo after the hosting is wired means reconnecting it
twice.

### 1. Create a company identity first

Register the company accounts to a **role mailbox** — `tms-platform@gccelab.com`
or similar, delivering to at least two people — never to one person's mailbox.
This is the root of every recovery path below; if it belongs to an individual,
the whole exercise has achieved nothing.

Enable MFA on it, and store the recovery codes wherever GCC Lab keeps
credentials, not in a personal password manager.

### 2. GitHub — transfer, don't recreate

Create the GCC Lab organisation, then use **Settings → Transfer ownership** on
the repo. Transfer keeps the full history, issues, and pull requests, and
redirects the old URL. Recreating loses all of it, and this repository's commit
history is a genuine part of the handover — it records why things are the way
they are.

Afterwards: add yourself back as an admin, and **re-check Actions secrets and
branch protection**, which do not always survive a transfer intact.

### 3. Vercel — recreate, don't transfer

The opposite call, for a specific reason. Vercel *can* transfer a project
between scopes, but the transfer has to hand over Marketplace resources too and
reports per-resource errors when it cannot. With only two integrations, no
production traffic, and deployment history worth nothing, a fresh project in the
company team is less work and ends up cleaner:

1. Create the GCC Lab team on **Pro** (this is what restores `*/5` cron).
2. New project → import the transferred GitHub repo.
3. Install **Resend** and **Sentry** from the Marketplace into the company team,
   so both bill to the company and their API keys are company-owned.
4. Add the environment variables from `docs/runbook.md`, using **freshly
   generated** values — see step 5.
5. Point `tms.gccelab.com` at this project. The DNS is already company-controlled.

Then delete the personal project, so there is exactly one deployment of this
platform in the world.

### 4. Supabase — company org, and production born there

Create the GCC Lab organisation. Transfer `gcctms-dev` and `gcctms-staging` into
it if the dashboard allows it in one step; if not, recreate them from the
versioned migrations in `supabase/migrations` — nothing in them is precious.

**Create the production project directly inside the company organisation.** A
production database should never have existed under a personal account, even
briefly. Region `eu-central-1`, matching dev and staging and the decision
recorded in `docs/residency.md`.

### 5. Generate new secrets — do not copy the current ones

Every key in `.env.local` today was minted under a personal account and should
be treated as compromised for production purposes. Generate fresh values for
production: database password, `SUPABASE_SERVICE_ROLE_KEY` (rotated in the
dashboard), `CRON_SECRET`, `NATIONAL_ID_HASH_KEY`, and the Resend and Sentry
keys, which the Marketplace injects automatically on install.

⚠️ **`NATIONAL_ID_HASH_KEY` is data-bearing.** It is the HMAC key behind exact
Iqama lookup, so changing it on a database that already holds employees makes
every existing record unfindable by ID number until they are re-hashed. On a
brand-new production database this is free — which is another reason to do all
of this before launch, not after.

## Access model afterwards

The point is not to hand everything over and walk away. It is that **the company
is the account and you are a member of it**, rather than the company depending
on your personal login.

- GCC Lab holds Owner on GitHub, Vercel and Supabase, through the role mailbox.
- You hold Admin/Developer on each — the same day-to-day access you have now.
- At least two people at GCC Lab can reach billing and recovery for each service.
- Offboarding anyone, including you, becomes removing a member instead of a
  migration project.

Worth settling in writing at the same time, though it is outside what any
document in this repo can decide: that the code is GCC Lab's property. If no
contract or IP assignment covers it yet, that gap is the same class of risk as
the accounts.

## Checklist

- [ ] Role mailbox created, MFA on, recovery codes stored with the company
- [ ] GitHub org created; repo transferred; Actions secrets and branch protection re-checked
- [ ] Vercel team created on **Pro**; project imported; Resend + Sentry installed there
- [ ] `vercel.json` cron restored to `*/5 * * * *` once on Pro (see `docs/runbook.md`)
- [ ] Supabase company org created; dev + staging moved; **production created there**
- [ ] All production secrets generated fresh, none copied from development
- [ ] `tms.gccelab.com` pointed at the company project
- [ ] Personal Vercel project and Supabase org deleted once verified
- [ ] Two GCC Lab staff confirmed able to sign in to all three services
