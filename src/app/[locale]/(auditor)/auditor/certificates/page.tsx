import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAuditCertificates } from "@/modules/audit/queries";
import { AuditTable, type AuditColumn } from "@/components/audit-table";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AuditorCertificatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.certificates");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const day = (v: Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : null);
  const rows: Row[] = (await listAuditCertificates()).map((r) => ({
    serial: r.serial,
    status: r.status,
    employeeName: r.employeeName,
    companyName: r.companyName,
    courseCode: r.courseCode,
    courseTitleEn: r.courseTitleEn,
    issuedAt: day(r.issuedAt),
    expiresAt: day(r.expiresAt),
    revokedReason: r.revokedReason,
  }));

  const columns: AuditColumn<Row>[] = [
    { key: "serial", label: t("colSerial") },
    { key: "status", label: t("colStatus") },
    { key: "employeeName", label: t("colEmployee") },
    { key: "companyName", label: t("colCompany") },
    { key: "courseCode", label: t("colCourse") },
    { key: "courseTitleEn", label: t("colCourseTitle") },
    { key: "issuedAt", label: t("colIssued") },
    { key: "expiresAt", label: t("colExpires") },
    { key: "revokedReason", label: t("colRevokedReason") },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {/* Stated on screen so nobody assumes the export was scrubbed by
            accident: Iqama numbers are withheld by design. */}
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AuditTable columns={columns} rows={rows} fileName="certificates" />
    </div>
  );
}
