import { pruneFinishedJobs, runPendingJobs } from "@/modules/platform/jobs/service";
// Importing the notifications module is what registers its handler — the
// registry is populated as a side effect of import, so a route that only
// imported the runner would find no handler and fail every job.
import "@/modules/platform/notifications/service";

// The retry net. queueNotification() delivers on the request that created it
// via after(); this catches anything that failed and backed off, and anything
// enqueued outside a request.
export const dynamic = "force-dynamic";
// Draining a backlog can outlast the default; well inside Vercel's 300s ceiling.
export const maxDuration = 60;

export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer $CRON_SECRET` when the variable is
  // set. Refusing when it is unset is deliberate: an open endpoint that
  // drains the mail queue is an endpoint anyone can use to flush mail.
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runPendingJobs(50);
  // Same tick: clear out finished jobs past their retention window. Sequential,
  // never Promise.all — see db/index.ts.
  const pruned = await pruneFinishedJobs();
  // Logged so a silent backlog shows up in runtime logs rather than only in
  // the jobs table.
  console.log("[cron/jobs]", { ...result, ...pruned });
  return Response.json({ ok: true, ...result, ...pruned });
}
