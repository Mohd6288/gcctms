// The printing list a manufacturer receives — step 9 of the workflow.
//
// This is the one document in the platform whose purpose is to leave the
// building, and the only place unmasked Iqama numbers are deliberately shared
// outside GCC Lab. They are here because a card cannot be printed without
// them; they are behind a signed link that expires rather than in the body of
// an email, because an inbox GCC Lab does not control keeps things forever.
import "server-only";
import { arabicFontFaces, renderPdf } from "@/modules/platform/pdf/service";

export interface PassListRow {
  name: string;
  iqama: string;
  companyName: string;
  isRetest: boolean;
}

export interface PassListData {
  courseTitleEn: string;
  courseTitleAr: string;
  testDate: string;
  venue: string;
  rows: PassListRow[];
}

// Anything below reaches a third party. Names and company names come from
// contractor input, so they are escaped rather than trusted.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPassListHtml(data: PassListData): string {
  const rows = data.rows
    .map(
      (row, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td class="mono">${escapeHtml(row.iqama)}</td>
        <td>${escapeHtml(row.companyName)}</td>
        <td>${row.isRetest ? "إعادة / Re-test" : "جديد / New"}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" />
<style>
  ${arabicFontFaces()}
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 56px;
    font-family: 'Noto Sans Arabic', Arial, sans-serif;
    color: #14191f; font-size: 13px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #5a6873; font-size: 12px; margin: 0 0 24px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .meta td { padding: 4px 0; vertical-align: top; }
  .meta .label { color: #5a6873; width: 130px; }
  table.list { width: 100%; border-collapse: collapse; }
  table.list th {
    text-align: left; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.06em; color: #5a6873; font-weight: 600;
    border-bottom: 2px solid #14191f; padding: 0 8px 6px 0;
  }
  table.list td { padding: 9px 8px 9px 0; border-bottom: 1px solid #dfe4e8; }
  td.num { width: 28px; color: #5a6873; }
  .mono { font-family: 'Courier New', monospace; letter-spacing: 0.04em; }
  .note {
    margin-top: 28px; padding: 12px 14px; background: #f3f5f7;
    border-left: 3px solid #175e70; font-size: 11px; color: #3b4854;
  }
</style>
</head>
<body>
  <h1>Qualification card printing list</h1>
  <p class="sub">قائمة إصدار بطاقات التأهيل — GCC Lab Development &amp; Certification Center</p>

  <table class="meta">
    <tr><td class="label">Test / الاختبار</td><td><strong>${escapeHtml(data.courseTitleEn)}</strong><br />${escapeHtml(data.courseTitleAr)}</td></tr>
    <tr><td class="label">Date / التاريخ</td><td>${escapeHtml(data.testDate)}</td></tr>
    <tr><td class="label">Venue / الموقع</td><td>${escapeHtml(data.venue)}</td></tr>
    <tr><td class="label">Passed / الناجحون</td><td><strong>${data.rows.length}</strong></td></tr>
  </table>

  <table class="list">
    <thead>
      <tr>
        <th>#</th><th>Technician / الفني</th><th>ID / الهوية</th>
        <th>Contractor / المقاول</th><th>Status / الحالة</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p class="note">
    This list contains identity numbers supplied solely to print qualification cards.
    Please do not forward it or retain it beyond that purpose.<br />
    تحتوي هذه القائمة على أرقام هوية مقدمة لغرض إصدار بطاقات التأهيل فقط. يرجى عدم إعادة إرسالها أو الاحتفاظ بها بعد ذلك.
  </p>
</body>
</html>`;
}

export async function renderPassListPdf(data: PassListData): Promise<Buffer> {
  // A4 portrait at 96dpi.
  return renderPdf(buildPassListHtml(data), {
    width: "794px",
    height: "1123px",
    viewport: { width: 794, height: 1123 },
  });
}
