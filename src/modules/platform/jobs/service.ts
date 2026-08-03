// platform/jobs — pg-backed async job queue for heavy/deferred work (PDF generation, bulk email, exports).
import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export async function enqueueJob(type: string, payload: Record<string, unknown> = {}) {
  const [job] = await db.insert(jobs).values({ type, payload }).returning({ id: jobs.id });
  return job;
}

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, JobHandler> = {};

// Modules that enqueue a job type register their handler here as a side
// effect of being imported (see notifications/service.ts) — whatever calls
// runPendingJobs() must import those modules first.
export function registerJobHandler(type: string, handler: JobHandler) {
  handlers[type] = handler;
}

// Real dispatch (Vercel Cron hitting an endpoint that calls this) lands in
// Phase 10. For now this is directly callable — by tests, or a manually
// triggered endpoint — proving jobs enqueued via enqueueJob() actually get
// processed asynchronously rather than inline at request time.
export async function runPendingJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  const pending = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, new Date())))
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const job of pending) {
    const handler = handlers[job.type];
    if (!handler) continue;

    await db.update(jobs).set({ status: "processing" }).where(eq(jobs.id, job.id));
    try {
      await handler(job.payload as Record<string, unknown>);
      await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, job.id));
      processed++;
    } catch (err) {
      const attempts = job.attempts + 1;
      const status = attempts >= job.maxAttempts ? "failed" : "pending";
      await db
        .update(jobs)
        .set({ status, attempts, lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(jobs.id, job.id));
      failed++;
    }
  }

  return { processed, failed };
}
