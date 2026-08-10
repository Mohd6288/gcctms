import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotConfiguredError, sendEmail } from "../../modules/platform/notifications/email";
import { renderEmail } from "../../modules/platform/notifications/templates";

// The transport's contract with Resend. fetch is stubbed because the point is
// what we send, not that Resend accepts it — an outbound HTTP call in a unit
// test is a flake and a bill.
describe("email transport", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "GCC Lab <no-reply@gcclab.test>";
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    process.env.EMAIL_FROM = originalFrom;
    vi.unstubAllGlobals();
  });

  it("posts to Resend with the bearer token and an idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "khalid@example.com",
      subject: "Training request #41 approved",
      html: "<p>hi</p>",
      text: "hi",
      idempotencyKey: "job-41",
    });

    expect(result.id).toBe("abc-123");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    // The whole defence against sending the same mail twice.
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("job-41");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("GCC Lab <no-reply@gcclab.test>");
    expect(body.to).toEqual(["khalid@example.com"]);
    expect(body.subject).toContain("#41");
  });

  it("throws with the provider's reason so it lands in the job's last_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "domain is not verified" }), { status: 422 }))
    );

    await expect(
      sendEmail({ to: "k@example.com", subject: "s", html: "h", text: "t", idempotencyKey: "job-1" })
      // [\s\S] rather than the /s flag — the project's TS target predates it,
      // and `npm run typecheck` is a CI gate.
    ).rejects.toThrow(/422[\s\S]*domain is not verified/);
  });

  it("refuses to pretend it sent anything when no API key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Throwing means the job stays pending and retries once the key is set,
    // rather than being marked delivered — which is how the old console.log
    // handler lost every notification the platform ever raised.
    await expect(
      sendEmail({ to: "k@example.com", subject: "s", html: "h", text: "t", idempotencyKey: "job-1" })
    ).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("email templates", () => {
  it("says the one thing that happened, in both languages", () => {
    const mail = renderEmail("request.approved", { requestId: 41 });
    expect(mail.subject).toBe("Training request #41 approved");
    expect(mail.text).toContain("#41");
    // Arabic first — the recipients are Saudi contractors and we hold no
    // language preference for them.
    expect(mail.html).toMatch(/direction:rtl/);
    expect(mail.html).toContain("طلب التدريب");
  });

  it("escapes anything that came from user input", () => {
    const mail = renderEmail("payment.rejected", { requestId: 7, reason: '<script>alert("x")</script>' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("covers every notification type the platform can raise", () => {
    const types = [
      "request.submitted", "request.approved", "request.rejected", "request.info_requested", "request.closed",
      "payment.uploaded", "payment.verified", "payment.rejected",
      "class.scheduled", "class.cancelled", "class.results_submitted",
      "certificate.pending_approval", "certificate.issued",
    ] as const;

    for (const type of types) {
      const mail = renderEmail(type, { requestId: 1, classId: 2, count: 3, serial: "GCCLAB-X" });
      // A blank subject or body would send an empty email rather than fail —
      // the quiet failure mode this whole change exists to remove.
      expect(mail.subject.length, type).toBeGreaterThan(5);
      expect(mail.text.length, type).toBeGreaterThan(20);
    }
  });
});
