// platform/jobs — pg-backed async job queue for heavy/deferred work (PDF generation, bulk email, exports).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export async function enqueueJob(type: string, payload: Record<string, unknown> = {}) {
  const [job] = await db.insert(jobs).values({ type, payload }).returning({ id: jobs.id });
  return job;
}

type JobHandler = (payload: Record<string, unknown>, context: { jobId: number; attempt: number }) => Promise<void>;

const handlers: Record<string, JobHandler> = {};

// Modules that enqueue a job type register their handler here as a side
// effect of being imported (see notifications/service.ts) — whatever calls
// runPendingJobs() must import those modules first.
export function registerJobHandler(type: string, handler: JobHandler) {
  handlers[type] = handler;
}

// Exponential-ish backoff, capped: 1, 4, 9, 16, 25 minutes. Without it a
// failing job retried on every tick, so a provider outage turned into a tight
// loop that burned all five attempts inside a few minutes and gave up.
function retryDelayMinutes(attempt: number) {
  return Math.min(attempt * attempt, 30);
}

export async function runPendingJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  // ::int on the id — bigint comes back from postgres.js as a STRING, and
  // the `as unknown as` cast below would have asserted otherwise all the way
  // to a handler comparing it against a number. Third time this trap has been
  // hit in this codebase.
  //
  // Claim atomically. The previous version SELECTed pending rows and then
  // marked them processing one at a time, so two overlapping runs — a cron
  // firing while an after() drain was still going — could both pick up the
  // same row and send the same email twice. FOR UPDATE SKIP LOCKED is the
  // standard Postgres queue claim: each row goes to exactly one worker, and
  // a worker never waits on another's rows.
  const claimed = (await db.execute(sql`
    update jobs
       set status = 'processing', updated_at = now()
     where id in (
       select id from jobs
        where status = 'pending' and run_at <= now()
        order by run_at
        limit ${limit}
        for update skip locked
     )
    returning id::int, type, payload, attempts, max_attempts
  `)) as unknown as Array<{ id: number; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }>;

  let processed = 0;
  let failed = 0;

  for (const job of claimed) {
    const handler = handlers[job.type];
    if (!handler) {
      // An unknown type would otherwise sit in `processing` forever, invisible
      // to the next run's `status = 'pending'` claim.
      await db.execute(sql`
        update jobs set status = 'failed', last_error = ${`No handler registered for "${job.type}"`}, updated_at = now()
         where id = ${job.id}
      `);
      failed++;
      continue;
    }

    try {
      await handler(job.payload, { jobId: job.id, attempt: job.attempts + 1 });
      await db.execute(sql`update jobs set status = 'completed', updated_at = now() where id = ${job.id}`);
      processed++;
    } catch (error) {
      const attempts = job.attempts + 1;
      const givingUp = attempts >= job.max_attempts;
      const message = error instanceof Error ? error.message : String(error);
      await db.execute(sql`
        update jobs
           set status = ${givingUp ? "failed" : "pending"},
               attempts = ${attempts},
               run_at = ${givingUp ? sql`run_at` : sql`now() + (${retryDelayMinutes(attempts)} || ' minutes')::interval`},
               last_error = ${message},
               updated_at = now()
         where id = ${job.id}
      `);
      failed++;
    }
  }

  return { processed, failed };
}

// How long a finished job is worth keeping.
//
// Long enough to investigate "did that email go out last month?", short
// enough that the table does not accumulate forever. Deliberately NOT applied
// to audit_log: that is the compliance record this platform exists to
// produce, and a certification trail that quietly deletes itself is worse
// than a large table. audit_log is 136 kB after a week of real use — it will
// not be a problem before it is somebody's deliberate decision to archive it.
const FINISHED_JOB_RETENTION_DAYS = 30;

export async function pruneFinishedJobs(): Promise<{ deleted: number }> {
  const rows = (await db.execute(sql`
    delete from jobs
     where status in ('completed', 'failed')
       and updated_at < now() - (${FINISHED_JOB_RETENTION_DAYS} || ' days')::interval
    returning id::int
  `)) as unknown as Array<{ id: number }>;
  return { deleted: rows.length };
}
