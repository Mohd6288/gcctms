// نموذج طلب اختبار — the test request form, filled and rendered.
//
// The paper form asks a contractor to declare their company details and, per
// technician, the occupation on their Iqama and the courses they already hold
// with the dates. The platform holds every one of those already. So this is
// generated rather than collected: the contractor picks employees and the form
// fills itself, which removes both the retyping and the gap where a course
// gets declared that was never taken.
import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { certificates, companies, courses, documents, employees, jobRoles, requestItems, trainingRequests } from "@/db/schema";
import { arabicFontFaces, renderPdf } from "@/modules/platform/pdf/service";
import { maskNationalId } from "@/modules/platform/security/national-id";

export interface TestRequestFormRow {
  name: string;
  occupation: string;
  maskedId: string;
  heldCourses: { code: string; obtainedOn: string }[];
  email: string;
}

export interface TestRequestFormData {
  companyName: string;
  crNumber: string;
  city: string;
  vatNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  activity: string;
  testTitleEn: string;
  testTitleAr: string;
  issuanceType: "new" | "renewal";
  venue: string;
  submittedOn: string;
  rows: TestRequestFormRow[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function getTestRequestFormData(requestId: number): Promise<TestRequestFormData | null> {
  const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, requestId));
  if (!request) return null;

  const [company] = await db.select().from(companies).where(eq(companies.id, request.companyId));
  const [course] = await db
    .select({ titleEn: courses.titleEn, titleAr: courses.titleAr })
    .from(courses)
    .where(eq(courses.id, request.courseId));

  const items = await db
    .select({
      employeeId: requestItems.employeeId,
      name: employees.fullNameEn,
      nationalIdEnc: employees.nationalIdEnc,
      email: employees.email,
      occupation: jobRoles.nameEn,
    })
    .from(requestItems)
    .innerJoin(employees, eq(employees.id, requestItems.employeeId))
    .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
    .where(eq(requestItems.requestId, requestId));

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler (see catalog/queries.ts's getPlatformOverviewStats).
  const rows: TestRequestFormRow[] = [];
  for (const item of items) {
    const issued = await db
      .select({ code: courses.code, on: certificates.issuedAt })
      .from(certificates)
      .innerJoin(courses, eq(courses.id, certificates.courseId))
      .where(and(eq(certificates.employeeId, item.employeeId), eq(certificates.status, "issued")));

    // A certificate earned elsewhere and verified by an admin counts exactly
    // as one this platform issued — that is what makes the declaration on the
    // paper form unnecessary rather than merely inconvenient.
    const external = await db
      .select({ code: courses.code, on: documents.issuedAt })
      .from(documents)
      .innerJoin(courses, eq(courses.id, documents.courseId))
      .where(
        and(
          eq(documents.employeeId, item.employeeId),
          eq(documents.type, "prior_certificate"),
          // Verified, not merely uploaded. An unverified upload is a claim
          // nobody has checked, and printing it on the request form as a held
          // course is exactly the declaration this form exists to replace.
          isNotNull(documents.verifiedAt)
        )
      );

    const held = [...issued, ...external]
      .filter((c) => c.on != null)
      .map((c) => ({ code: c.code, obtainedOn: String(c.on).slice(0, 10) }))
      .sort((a, b) => a.code.localeCompare(b.code));

    rows.push({
      name: item.name,
      occupation: item.occupation ?? "",
      // Masked. The form is a record of a request, not a place identity
      // numbers need to sit — the manufacturer's printing list is the only
      // document that needs them in full.
      maskedId: maskNationalId(item.nationalIdEnc) ?? "",
      heldCourses: held,
      email: item.email ?? "",
    });
  }

  return {
    companyName: company?.name ?? "",
    crNumber: company?.crNumber ?? "",
    city: company?.city ?? "",
    vatNumber: company?.vatNumber ?? "",
    contactName: company?.contactName ?? "",
    contactPhone: company?.contactPhone ?? "",
    contactEmail: company?.contactEmail ?? "",
    activity: company?.sector ?? "",
    testTitleEn: course?.titleEn ?? "",
    testTitleAr: course?.titleAr ?? "",
    issuanceType: (request.issuanceType as "new" | "renewal") ?? "new",
    venue: request.externalInstituteName ?? request.preferredCity ?? "",
    submittedOn: new Date().toISOString().slice(0, 10),
    rows,
  };
}

export function buildTestRequestFormHtml(data: TestRequestFormData): string {
  const tick = (on: boolean) => (on ? "☑" : "☐");

  const rows = data.rows
    .map(
      (row, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.occupation)}</td>
        <td class="mono">${escapeHtml(row.maskedId)}</td>
        <td class="small">${row.heldCourses.map((c) => escapeHtml(c.code)).join("، ") || "—"}</td>
        <td class="small mono">${row.heldCourses.map((c) => escapeHtml(c.obtainedOn)).join("، ") || "—"}</td>
        <td class="small">${escapeHtml(row.email)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" />
<style>
  ${arabicFontFaces()}
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 44px; font-family: 'Noto Sans Arabic', Arial, sans-serif; color: #14191f; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .sub { color: #5a6873; font-size: 11px; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; }
  .meta td { padding: 5px 0; vertical-align: top; }
  .meta .label { color: #5a6873; width: 120px; }
  .section { margin-top: 18px; font-weight: 700; font-size: 12px; }
  table.list { margin-top: 8px; }
  table.list th { text-align: right; font-size: 10px; color: #5a6873; font-weight: 600; border-bottom: 2px solid #14191f; padding: 0 6px 5px 0; }
  table.list td { padding: 7px 6px 7px 0; border-bottom: 1px solid #dfe4e8; vertical-align: top; }
  td.num { width: 24px; color: #5a6873; }
  .mono { font-family: 'Courier New', monospace; }
  .small { font-size: 10px; }
  .choices { margin-top: 10px; }
  .choices span { margin-inline-end: 18px; }
  .declaration { margin-top: 20px; padding: 10px 12px; background: #f3f5f7; font-size: 10.5px; line-height: 1.7; }
  .sign { margin-top: 22px; width: 100%; }
  .sign td { padding-top: 22px; border-top: 1px solid #cdd5da; font-size: 10px; color: #5a6873; }
</style>
</head>
<body>
  <h1>نموذج طلب اختبار — مقاول</h1>
  <p class="sub">Contractor Test Request Form · GCC Lab Development &amp; Certification Center</p>

  <div class="section">معلومات مقدم الطلب</div>
  <table class="meta">
    <tr><td class="label">اسم الشركة</td><td>${escapeHtml(data.companyName)}</td>
        <td class="label">المدينة</td><td>${escapeHtml(data.city)}</td></tr>
    <tr><td class="label">السجل التجاري</td><td>${escapeHtml(data.crNumber)}</td>
        <td class="label">الرقم الضريبي</td><td>${escapeHtml(data.vatNumber)}</td></tr>
    <tr><td class="label">شخص الاتصال</td><td>${escapeHtml(data.contactName)}</td>
        <td class="label">رقم الجوال</td><td class="mono">${escapeHtml(data.contactPhone)}</td></tr>
    <tr><td class="label">البريد الإلكتروني</td><td>${escapeHtml(data.contactEmail)}</td>
        <td class="label">النشاط</td><td>${escapeHtml(data.activity)}</td></tr>
  </table>

  <div class="section">بيانات المرشحين للاختبار</div>
  <table class="list">
    <thead>
      <tr>
        <th>م</th><th>الاسم</th><th>المهنة</th><th>رقم الهوية</th>
        <th>الدورات الحاصل عليها</th><th>تواريخ الحصول</th><th>البريد الإلكتروني</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="section">الاختبار المطلوب</div>
  <table class="meta">
    <tr><td class="label">اسم الاختبار</td><td>${escapeHtml(data.testTitleAr)}<br /><span class="small">${escapeHtml(data.testTitleEn)}</span></td></tr>
    <tr><td class="label">مكان الاختبار</td><td>${escapeHtml(data.venue)}</td></tr>
  </table>
  <div class="choices">
    <span>نوع الطلب:</span>
    <span>${tick(data.issuanceType === "new")} إصدار جديد</span>
    <span>${tick(data.issuanceType === "renewal")} تجديد</span>
  </div>

  <div class="declaration">
    أقر أنا الموقع أدناه بأن كافة البيانات المذكورة بهذا الطلب صحيحة وأتحمل المسؤولية الكاملة إذا اتضح خلاف ذلك،
    وأن التأهيل الفني المطلوب أعلاه حسب مصفوفة التدريب والتأهيل المعتمدة بغرض العمل كمقاول في الشركة السعودية للكهرباء.
    <br />
    <span class="small">البيانات أعلاه مستخرجة من سجلات المنصة، وأرقام الهوية معروضة بشكل مختصر.</span>
  </div>

  <table class="sign">
    <tr>
      <td>تاريخ تقديم الطلب: ${escapeHtml(data.submittedOn)}</td>
      <td>اسم مقدم الطلب: ${escapeHtml(data.contactName)}</td>
      <td>التوقيع: ______________</td>
    </tr>
  </table>
</body>
</html>`;
}

export async function renderTestRequestFormPdf(data: TestRequestFormData): Promise<Buffer> {
  // A4 portrait at 96dpi.
  return renderPdf(buildTestRequestFormHtml(data), {
    width: "794px",
    height: "1123px",
    viewport: { width: 794, height: 1123 },
  });
}
