import { getTranslations } from "next-intl/server";
import { ProfileHeader, ProgressCard } from "./profile-header";
import { Timeline, type HistoryEntry } from "./timeline";

// One employee profile, rendered identically for an auditor, an admin and the
// contractor who employs them. The differences between those three are what
// the PAGE fetches and whether it offers a certificate download — not what a
// profile looks like, which is why this takes plain data and no context.
export interface EmployeeProfileData {
  id: number;
  fullNameEn: string;
  fullNameAr: string;
  nationalIdMasked: string | null;
  companyName: string;
  companyRegion: string | null;
  jobRoleName: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

export async function EmployeeProfile({
  employee,
  identity,
  progress,
  certificates,
  training,
  history,
  locale,
  certificateHref,
}: {
  employee: EmployeeProfileData;
  identity: { verifiedAt: Date | string | null; rejectedAt: Date | string | null; verifierName: string | null } | null;
  progress: { valid: number; expiring_soon: number; expired: number; classes_upcoming: number };
  certificates: {
    id: number;
    serial: string | null;
    status: string;
    courseCode: string;
    courseTitleEn: string;
    courseTitleAr: string;
    issuedAt: Date | string | null;
    expiresAt: Date | string | null;
  }[];
  training: {
    enrollmentId: number;
    courseCode: string;
    courseTitleEn: string;
    courseTitleAr: string;
    startDate: string;
    endDate: string;
    region: string;
    classStatus: string;
    enrollmentStatus: string;
    attendancePct: string | null;
    examScore: number | null;
    examResult: string | null;
  }[];
  history: HistoryEntry[];
  locale: string;
  /** Omit to render certificates without download links. */
  certificateHref?: (certificateId: number) => string;
}) {
  const t = await getTranslations("profile.employee");
  const day = (v: Date | string | null) => (v ? new Date(v).toLocaleDateString(locale) : null);
  const title = (en: string, ar: string) => (locale === "ar" ? ar : en);

  const identityChip: { label: string; tone: "success" | "warning" | "destructive" } = identity?.verifiedAt
    ? { label: t("iqamaVerified"), tone: "success" }
    : identity?.rejectedAt
      ? { label: t("iqamaRejected"), tone: "destructive" }
      : { label: t("iqamaUnverified"), tone: "warning" };

  return (
    <div className="flex w-full flex-col gap-6">
      <ProfileHeader
        name={title(employee.fullNameEn, employee.fullNameAr)}
        subtitle={`${employee.companyName}${employee.companyRegion ? ` · ${employee.companyRegion}` : ""}`}
        chips={[
          { label: employee.status === "active" ? t("statusActive") : t("statusInactive"), tone: employee.status === "active" ? "success" : "muted" },
          identityChip,
        ]}
        facts={[
          // Masked, never the full number: enough to match a person against a
          // paper record without putting identity numbers on a screen or into
          // an export.
          { label: t("iqama"), value: employee.nationalIdMasked, mono: true },
          { label: t("jobRole"), value: employee.jobRoleName },
          { label: t("nationality"), value: employee.nationality },
          { label: t("phone"), value: employee.phone },
          { label: t("email"), value: employee.email },
          {
            label: t("iqamaChecked"),
            value: identity?.verifiedAt ? `${day(identity.verifiedAt)}${identity.verifierName ? ` · ${identity.verifierName}` : ""}` : null,
          },
        ]}
      />

      <ProgressCard
        title={t("progressTitle")}
        stats={[
          { label: t("statValid"), value: progress.valid, tone: "success" },
          { label: t("statExpiringSoon"), value: progress.expiring_soon, tone: progress.expiring_soon > 0 ? "warning" : undefined },
          { label: t("statExpired"), value: progress.expired, tone: progress.expired > 0 ? "destructive" : undefined },
          { label: t("statUpcoming"), value: progress.classes_upcoming },
        ]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("certificatesTitle")}</h2>
        {certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("certificatesEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-3 text-start font-medium">{t("colCourse")}</th>
                  <th className="p-3 text-start font-medium">{t("colSerial")}</th>
                  <th className="p-3 text-start font-medium">{t("colIssued")}</th>
                  <th className="p-3 text-start font-medium">{t("colExpires")}</th>
                  <th className="p-3 text-start font-medium">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert) => {
                  const expired = cert.expiresAt != null && new Date(cert.expiresAt) < new Date();
                  return (
                    <tr key={cert.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        {cert.courseCode} — {title(cert.courseTitleEn, cert.courseTitleAr)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {certificateHref && cert.status === "issued" && cert.serial ? (
                          <a href={certificateHref(cert.id)} className="text-primary hover:underline">
                            {cert.serial}
                          </a>
                        ) : (
                          (cert.serial ?? "—")
                        )}
                      </td>
                      <td className="p-3">{day(cert.issuedAt) ?? "—"}</td>
                      <td className="p-3">{day(cert.expiresAt) ?? "—"}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            cert.status === "revoked"
                              ? "bg-destructive/15 text-destructive"
                              : expired
                                ? "bg-warning/15 text-warning"
                                : "bg-success/15 text-success"
                          }`}
                        >
                          {cert.status === "revoked" ? t("certRevoked") : expired ? t("certExpired") : t("certValid")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("trainingTitle")}</h2>
        {training.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("trainingEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-3 text-start font-medium">{t("colCourse")}</th>
                  <th className="p-3 text-start font-medium">{t("colDates")}</th>
                  <th className="p-3 text-start font-medium">{t("colAttendance")}</th>
                  <th className="p-3 text-start font-medium">{t("colExam")}</th>
                  <th className="p-3 text-start font-medium">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {training.map((row) => (
                  <tr key={row.enrollmentId} className="border-b border-border last:border-0">
                    <td className="p-3">
                      {row.courseCode} — {title(row.courseTitleEn, row.courseTitleAr)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {row.startDate} → {row.endDate} · {row.region}
                    </td>
                    <td className="p-3">{row.attendancePct != null ? `${Number(row.attendancePct)}%` : "—"}</td>
                    <td className="p-3">
                      {row.examResult ? `${row.examResult}${row.examScore != null ? ` (${row.examScore})` : ""}` : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {row.enrollmentStatus} · {row.classStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Timeline entries={history} locale={locale} title={t("historyTitle")} />
    </div>
  );
}
