import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAuditRequests } from "@/modules/audit/queries";
import { AuditTable, type AuditColumn } from "@/components/audit-table";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AuditorRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.requests");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const rows: Row[] = (await listAuditRequests()).map((r) => ({
    id: r.id,
    status: r.status,
    companyName: r.companyName,
    companyRegion: r.companyRegion,
    courseCode: r.courseCode,
    courseTitleEn: r.courseTitleEn,
    preferredCity: r.preferredCity,
    candidates: r.candidates,
    totalAmount: r.totalAmount,
    createdAt: new Date(r.createdAt).toISOString().slice(0, 10),
  }));

  const columns: AuditColumn<Row>[] = [
    { key: "id", label: t("colId") },
    { key: "status", label: t("colStatus") },
    { key: "companyName", label: t("colCompany") },
    { key: "companyRegion", label: t("colRegion") },
    { key: "courseCode", label: t("colCourse") },
    { key: "courseTitleEn", label: t("colCourseTitle") },
    { key: "preferredCity", label: t("colCity") },
    { key: "candidates", label: t("colCandidates") },
    { key: "totalAmount", label: t("colTotal") },
    { key: "createdAt", label: t("colCreated") },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AuditTable columns={columns} rows={rows} fileName="training-requests" />
    </div>
  );
}
