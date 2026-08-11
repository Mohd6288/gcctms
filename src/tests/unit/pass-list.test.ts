import { describe, expect, it } from "vitest";
import { buildPassListHtml } from "../../modules/cards/pass-list";
import { renderEmail } from "../../modules/platform/notifications/templates";

// The pass list is the only thing this platform deliberately sends out of the
// building carrying unmasked Iqama numbers. Two rules follow, and both are
// easy to break by accident later:
//
//   the PDF behind the expiring link carries them in full, because a card
//   cannot be printed without them;
//   the email carries only the last four, because an inbox GCC Lab does not
//   control keeps things forever.
const ROWS = [
  { name: "MOHAMMED AFZAL", iqama: "2375973399", companyName: "TECHSEN COMPANY", isRetest: false },
  { name: "NISSALI ABDULLAH", iqama: "2360190991", companyName: "TECHSEN COMPANY", isRetest: true },
];

describe("the printing list", () => {
  const html = buildPassListHtml({
    courseTitleEn: "Power Cable Joint & Termination – 33KV",
    courseTitleAr: "تركيب وصلات ونهايات كابلات القوى - 33 ك.ف",
    testDate: "2025-11-13",
    venue: "Cable workshop – GCCLAB",
    rows: ROWS,
  });

  it("carries the full identity number, because the card cannot be printed without it", () => {
    expect(html).toContain("2375973399");
    expect(html).toContain("2360190991");
  });

  it("marks a re-test as إعادة and a first sitting as جديد", () => {
    // The card receipt form records حالة المختبر per person, and the
    // manufacturer needs it to know which cards are replacements.
    expect(html).toContain("جديد / New");
    expect(html).toContain("إعادة / Re-test");
  });

  it("embeds the Arabic font rather than trusting the renderer to have one", () => {
    // Headless Chromium has no system fonts. Without the inlined face the
    // Arabic renders as boxes, or as unshaped letters that look like text.
    expect(html).toMatch(/@font-face[\s\S]*Noto Sans Arabic/);
    expect(html).toContain("data:font/woff2;base64,");
  });

  it("escapes contractor-supplied text", () => {
    // Names and company names come from contractor input and end up in a
    // document sent to a third party.
    const injected = buildPassListHtml({
      courseTitleEn: "T",
      courseTitleAr: "ت",
      testDate: "2025-11-13",
      venue: "V",
      rows: [{ name: '<script>alert("x")</script>', iqama: "1", companyName: "C", isRetest: false }],
    });
    expect(injected).not.toContain("<script>alert");
    expect(injected).toContain("&lt;script&gt;");
  });

  it("tells the recipient not to keep or forward it", () => {
    expect(html).toMatch(/do not forward/i);
    expect(html).toContain("عدم إعادة إرسالها");
  });
});

describe("the dispatch email", () => {
  const mail = renderEmail("card.pass_list_dispatched", {
    classId: 41,
    courseTitle: "Power Cable Joint & Termination – 33KV",
    testDate: "2025-11-13",
    count: 2,
    names: ROWS.map((r) => `${r.name} ••••••${r.iqama.slice(-4)}`),
  });

  it("carries no identity number in full", () => {
    // The regression that matters: someone passing the unmasked rows into the
    // notification data would leak every Iqama into a third party's mailbox,
    // permanently and unloggably.
    for (const row of ROWS) {
      expect(mail.html, `${row.name}'s Iqama must not be in the email`).not.toContain(row.iqama);
      expect(mail.text).not.toContain(row.iqama);
    }
  });

  it("still names who passed, masked, so the recipient can check the list", () => {
    expect(mail.text).toContain("MOHAMMED AFZAL");
    expect(mail.text).toContain("3399");
    expect(mail.text).toContain("0991");
  });

  it("says the link expires", () => {
    expect(mail.text).toMatch(/72 hours/i);
    expect(mail.html).toContain("72 ساعة");
  });
});
