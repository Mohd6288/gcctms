import { describe, expect, it } from "vitest";
import { renderTestRequestFormPdf } from "../../modules/requests/test-request-form";

// The HTML is asserted in the unit test; this proves the thing actually comes
// out of Chromium as a PDF. Worth its own check because the failure mode is
// environmental — a missing browser or an unresolvable font path — and it
// appears only at the moment a contractor asks for their form.
describe("rendering نموذج طلب اختبار", () => {
  it("produces a real PDF", async () => {
    const pdf = await renderTestRequestFormPdf({
      companyName: "TECHSEN COMPANY",
      crNumber: "1010101010",
      city: "Riyadh",
      vatNumber: "300000000000003",
      contactName: "A. Rahman",
      contactPhone: "0555000012",
      contactEmail: "ops@techsen.example",
      activity: "Electrical contracting",
      testTitleEn: "Installation of Power Cable Joint – 33KV",
      testTitleAr: "تركيب وصلات كابلات القوى - 33 ك.ف",
      issuanceType: "new",
      venue: "Cable workshop – GCCLAB",
      submittedOn: "2026-08-11",
      rows: [
        {
          name: "MOHAMMED AFZAL",
          occupation: "Cable Joint & Termination Technician (33KV)",
          maskedId: "••••••3399",
          heldCourses: [{ code: "CSCC02", obtainedOn: "2025-03-04" }],
          email: "afzal@techsen.example",
        },
      ],
    });

    // %PDF- is the file signature; anything else means the renderer returned
    // an error page or an empty buffer.
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // A page carrying an embedded Arabic font is tens of kilobytes. A few
    // hundred bytes would mean it rendered blank.
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  }, 30_000);
});
