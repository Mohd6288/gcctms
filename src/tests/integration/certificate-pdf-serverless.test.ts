import { afterEach, expect, it } from "vitest";
import { renderCertificatePdf } from "../../modules/platform/pdf/service";

// The certificate renderer takes a different path on Vercel than it does
// here: no browser ships with the serverless runtime, so it drives
// @sparticuz/chromium instead of the locally installed Playwright browser.
// That path is the one that matters in production and the one nobody
// exercises by accident, so it gets its own test — a green local suite
// otherwise says nothing about whether a certificate can be issued.
const SAMPLE = {
  employeeNameEn: "Sathis Kumar Sivanesan",
  employeeNameAr: "ساتيش كومار سيفانيسان",
  iqama: "2342973126",
  contractorName: "AlFanar Projects Co.",
  courseCode: "CSCC00",
  courseTitleEn: "OHS General Induction",
  courseTitleAr: "التعريف العام بالصحة والسلامة المهنية",
  startDateLabel: "1 Aug 2026",
  endDateLabel: "1 Aug 2026",
  validTillLabel: "1 Aug 2028",
  serial: "CSCC00-2026-000001",
  verifyUrl: "https://example.com/verify/CSCC00-2026-000001",
};

afterEach(() => {
  delete process.env.VERCEL;
});

it("renders a certificate through the serverless Chromium path", async () => {
  process.env.VERCEL = "1";
  const pdf = await renderCertificatePdf(SAMPLE);

  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  // A blank or font-less render still produces a valid PDF header, so check
  // it carries real content: the letterhead background alone puts this well
  // into six figures.
  expect(pdf.length).toBeGreaterThan(50_000);
}, 180_000);
