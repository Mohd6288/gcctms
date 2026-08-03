-- pg-backed async job queue (security-and-hosting.md / project-structure.md's
-- "jobs/ # queue/cron wrappers + job handlers"). First consumer is queued
-- email notifications (Phase 4: "emails go through the queue, not inline").
-- Purely internal infrastructure — no authenticated/anon access at all, only
-- the server-only Drizzle connection touches this table.
create table jobs (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_run_at_idx on jobs (status, run_at);

alter table jobs enable row level security;

-- No grant, no policy for authenticated/anon: server-only, by design.
