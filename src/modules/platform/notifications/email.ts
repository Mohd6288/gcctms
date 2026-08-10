// platform/notifications/email — the actual sender.
//
// Resend's REST API over fetch rather than their SDK: one POST with a bearer
// token is the whole integration, and a dependency that wraps a single
// request is a dependency to keep patched for no gain. The provider comes
// from the Vercel Marketplace integration, which injects RESEND_API_KEY.
import "server-only";

// RESEND_ENDPOINT exists so the full path — queue, claim, handler, HTTP —
// can be pointed at a local stub and proven end to end. Unset everywhere real.
const ENDPOINT = process.env.RESEND_ENDPOINT ?? "https://api.resend.com/emails";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Stable per message. Resend keeps it for 24 hours and returns the original
   * result instead of sending again — so a retry after a timeout, or two
   * workers racing the same row, cannot deliver the same mail twice. The job
   * id is exactly that key.
   */
  idempotencyKey: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set — install the Resend integration and redeploy.");
    this.name = "EmailNotConfiguredError";
  }
}

// Sender address. Resend only accepts a domain you have verified; until
// GCC Lab's own domain is verified, onboarding@resend.dev works and delivers
// only to the account owner, which is the right behaviour for a staging
// environment — it cannot accidentally mail a real contractor.
function fromAddress() {
  return process.env.EMAIL_FROM ?? "GCC Lab <onboarding@resend.dev>";
}

export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailNotConfiguredError();

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    // Read the body for the reason — Resend returns a JSON message, and
    // "422" alone in a job's last_error tells whoever reads it nothing.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as { id?: string };
  return { id: body.id ?? "" };
}
