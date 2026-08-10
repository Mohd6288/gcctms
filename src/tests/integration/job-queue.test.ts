import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db";
import { jobs } from "../../db/schema";
import { enqueueJob, registerJobHandler, runPendingJobs } from "../../modules/platform/jobs/service";

// This queue is what stands between "the platform decided to tell you
// something" and you being told. It went months delivering nothing because
// nothing ran it; these tests cover the parts that decide whether a message
// arrives once, twice, or never.
describe("job queue — real DB", () => {
  const created: number[] = [];
  // A shared queue: this database already holds pending jobs from other
  // suites and from local use, and runPendingJobs claims the oldest first.
  // Park them beyond the horizon for the duration so the suite sees only its
  // own rows, then put them back exactly as they were.
  let parked: number[] = [];

  async function enqueue(type: string, payload: Record<string, unknown> = {}) {
    const job = await enqueueJob(type, payload);
    created.push(job.id);
    return job.id;
  }

  beforeAll(async () => {
    const existing = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "pending"));
    parked = existing.map((row) => row.id);
    if (parked.length > 0) {
      await db.update(jobs).set({ runAt: new Date(Date.now() + 86_400_000) }).where(inArray(jobs.id, parked));
    }
  });

  beforeEach(() => {
    created.length = 0;
  });

  afterAll(async () => {
    await db.execute(sql`delete from jobs where type like 'test.%'`);
    if (parked.length > 0) {
      await db.update(jobs).set({ runAt: new Date() }).where(inArray(jobs.id, parked));
    }
  });

  it("runs a handler once and completes the job", async () => {
    const type = `test.ok.${randomUUID().slice(0, 8)}`;
    const seen: number[] = [];
    registerJobHandler(type, async (_payload, ctx) => {
      seen.push(ctx.jobId);
    });

    const id = await enqueue(type, { hello: "world" });
    const result = await runPendingJobs();

    expect(seen).toContain(id);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("completed");
  });

  // The one that matters most for email: a cron tick overlapping an after()
  // drain must not deliver the same message twice.
  it("hands each job to exactly one concurrent worker", async () => {
    const type = `test.race.${randomUUID().slice(0, 8)}`;
    const handled: number[] = [];
    registerJobHandler(type, async (_payload, ctx) => {
      // Hold the claim briefly so the runs genuinely overlap.
      await new Promise((resolve) => setTimeout(resolve, 40));
      handled.push(ctx.jobId);
    });

    const ids = [await enqueue(type), await enqueue(type), await enqueue(type)];
    await Promise.all([runPendingJobs(), runPendingJobs(), runPendingJobs()]);

    // Three jobs, three handler calls — not six, not nine.
    expect(handled.filter((id) => ids.includes(id))).toHaveLength(3);
    expect(new Set(handled).size).toBe(handled.length);

    const rows = await db.select().from(jobs).where(inArray(jobs.id, ids));
    expect(rows.every((r) => r.status === "completed")).toBe(true);
  });

  it("backs a failed job off instead of retrying it on the next tick", async () => {
    const type = `test.fail.${randomUUID().slice(0, 8)}`;
    let calls = 0;
    registerJobHandler(type, async () => {
      calls += 1;
      throw new Error("provider is down");
    });

    const id = await enqueue(type);
    await runPendingJobs();
    expect(calls).toBe(1);

    const [afterFirst] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(afterFirst.status).toBe("pending"); // will be retried
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.lastError).toContain("provider is down");
    // Pushed into the future — without this a provider outage burned all five
    // attempts within seconds.
    expect(new Date(afterFirst.runAt).getTime()).toBeGreaterThan(Date.now() + 30_000);

    // An immediate second run must not pick it up again.
    await runPendingJobs();
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts rather than retrying forever", async () => {
    const type = `test.giveup.${randomUUID().slice(0, 8)}`;
    registerJobHandler(type, async () => {
      throw new Error("always broken");
    });

    const id = await enqueue(type);
    await db.update(jobs).set({ attempts: 4, maxAttempts: 5 }).where(eq(jobs.id, id));

    await runPendingJobs();
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(5);
  });

  it("fails a job with no handler instead of leaving it stuck in processing", async () => {
    // Previously an unknown type was claimed, skipped, and left as
    // "processing" — invisible to every later run, which claims "pending".
    const id = await enqueue(`test.unknown.${randomUUID().slice(0, 8)}`);
    await runPendingJobs();

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("No handler registered");
  });
});
