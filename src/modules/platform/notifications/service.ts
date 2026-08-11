// platform/notifications — Queued notification jobs (email via Resend/SES now, SMS-ready interface).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { after } from "next/server";
import { enqueueJob, registerJobHandler, runPendingJobs } from "@/modules/platform/jobs/service";
import { sendEmail } from "./email";
import { renderEmail } from "./templates";

// Per roles-and-workflows.md's Notifications section.
export type NotificationType =
  | "request.submitted"
  | "request.approved"
  | "request.rejected"
  | "request.info_requested"
  | "request.closed"
  | "payment.uploaded"
  | "payment.verified"
  | "payment.rejected"
  | "class.scheduled"
  | "class.cancelled"
  | "class.results_submitted"
  | "certificate.pending_approval"
  | "certificate.issued"
  // The card programme (0038). A certificate waits for GCC Lab to approve it;
  // a card waits for the pass list to reach whoever prints it.
  | "card.awaiting_dispatch"
  | "card.pass_list_dispatched"
  | "card.ready_for_collection";

export interface QueueNotificationInput {
  type: NotificationType;
  recipientEmail: string;
  data: Record<string, unknown>;
}

// Callers never send email inline — every notification goes through the job
// queue (Phase 4 acceptance criteria: "emails go through the queue, not
// inline").
export async function queueNotification(input: QueueNotificationInput) {
  await enqueueJob("notification.email", { ...input });
  drainSoon();
}

// Deliver on this request, after the response has gone back — the contractor
// gets their approval email in seconds rather than waiting for the next cron
// tick. The cron remains the safety net for retries and for anything enqueued
// outside a request.
//
// after() throws outside a request scope (a script, a test), which is not an
// error here: those callers are not serving anybody, and the cron will pick
// the row up.
function drainSoon() {
  try {
    after(async () => {
      await runPendingJobs();
    });
  } catch {
    // No request to piggyback on. The job is queued; the cron will send it.
  }
}

// Active platform_admin emails — no Drizzle schema exists for auth.users
// (Supabase-managed, not ours), so this reads it directly.
async function getPlatformAdminEmails(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select u.email as email from profiles p
    join auth.users u on u.id = p.user_id
    where p.role = 'platform_admin' and p.active = true
  `)) as unknown as Array<{ email: string | null }>;
  return rows.map((r) => r.email).filter((email): email is string => Boolean(email));
}

// Fans out to every active platform_admin (roles-and-workflows.md: "new
// request submitted" etc. are platform_admin notifications, not scoped to
// one person).
export async function notifyPlatformAdmins(type: NotificationType, data: Record<string, unknown>) {
  const emails = await getPlatformAdminEmails();
  for (const recipientEmail of emails) {
    await queueNotification({ type, recipientEmail, data });
  }
}

// Trainers authenticate via auth.users like every other role, so their
// email lives there too — no Drizzle schema for auth.users, read directly.
export async function getTrainerEmail(trainerId: number): Promise<string | null> {
  const rows = (await db.execute(sql`
    select u.email as email from trainers t
    join auth.users u on u.id = t.user_id
    where t.id = ${trainerId}
  `)) as unknown as Array<{ email: string | null }>;
  return rows[0]?.email ?? null;
}

// Stub handler — proves the queue architecture (enqueue now, deliver async)
// rather than real delivery. Real ESP (Resend/SES) credentials + client
// land when production email infra is wired up (Phase 10).
// The sender. Until now this logged the payload and marked the job done, so
// every notification the platform ever "sent" was a line in a log file.
registerJobHandler("notification.email", async (payload, { jobId }) => {
  const { type, recipientEmail, data } = payload as unknown as QueueNotificationInput;
  if (!recipientEmail) return; // nobody to tell; not a failure

  const { subject, html, text } = renderEmail(type, data ?? {});
  await sendEmail({
    to: recipientEmail,
    subject,
    html,
    text,
    // The job id is the natural idempotency key: a retry after a timeout, or
    // two workers racing the same row, resolves to one delivered message.
    idempotencyKey: `job-${jobId}`,
  });
});
