import { describe, expect, it } from "vitest";
import { buildTestRequestFormHtml, type TestRequestFormData } from "../../modules/requests/test-request-form";

// نموذج طلب اختبار, generated rather than collected. The paper form asks the
// contractor to declare their company details and each technician's occupation
// and prior courses; the platform holds all of it already.
const DATA: TestRequestFormData = {
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
  issuanceType: "renewal",
  venue: "Cable workshop – GCCLAB",
  submittedOn: "2026-08-11",
  rows: [
    {
      name: "MOHAMMED AFZAL",
      occupation: "Cable Joint & Termination Technician (33KV)",
      maskedId: "••••••3399",
      heldCourses: [
        { code: "CSCC00", obtainedOn: "2025-02-10" },
        { code: "CSCC02", obtainedOn: "2025-03-04" },
      ],
      email: "afzal@techsen.example",
    },
  ],
};

describe("the generated test request form", () => {
  const html = buildTestRequestFormHtml(DATA);

  it("fills the company block from the record rather than asking for it again", () => {
    expect(html).toContain("TECHSEN COMPANY");
    expect(html).toContain("1010101010");
    expect(html).toContain("300000000000003");
  });

  it("lists the courses a technician holds, with their dates", () => {
    // The paper form asks the contractor to declare these. The platform knows
    // them, which removes the gap where a course gets claimed but never taken.
    expect(html).toContain("CSCC00");
    expect(html).toContain("2025-03-04");
  });

  it("masks identity numbers — this form is a record of a request, not a printing list", () => {
    expect(html).toContain("••••••3399");
    expect(html).not.toContain("2375973399");
  });

  it("ticks the request type that was actually chosen", () => {
    expect(html).toContain("☑ تجديد");
    expect(html).toContain("☐ إصدار جديد");
  });

  it("carries the declaration and the SEC training matrix wording", () => {
    expect(html).toContain("أقر أنا الموقع أدناه");
    expect(html).toContain("مصفوفة التدريب والتأهيل المعتمدة");
  });

  it("renders right-to-left with the Arabic face embedded", () => {
    // Headless Chromium has no system fonts; without the inlined face this
    // whole form prints as boxes.
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("data:font/woff2;base64,");
  });

  it("escapes contractor-supplied text", () => {
    const injected = buildTestRequestFormHtml({ ...DATA, companyName: '<script>alert("x")</script>' });
    expect(injected).not.toContain("<script>alert");
    expect(injected).toContain("&lt;script&gt;");
  });
});
