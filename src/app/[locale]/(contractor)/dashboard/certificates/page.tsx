import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listCertificatesForCompany } from "@/modules/certification/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ContractorCertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.certificates");

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const allCertificates = await listCertificatesForCompany(context.companyId);
  // Only 'issued' certs are visible to companies — matches the validated
  // prototype and roles-and-workflows.md ("only 'issued' certs are visible
  // to companies/public verification").
  const certificates = allCertificates.filter((c) => c.status === "issued");

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableSerial")}</th>
              <th className="p-3 text-start font-medium">{t("tableEmployee")}</th>
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableIssued")}</th>
              <th className="p-3 text-start font-medium">{t("tableExpires")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {certificates.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              certificates.map((cert) => (
                <tr key={cert.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono text-xs">{cert.serial}</td>
                  <td className="p-3">{locale === "ar" ? cert.employeeFullNameAr : cert.employeeFullNameEn}</td>
                  <td className="p-3">
                    {cert.courseCode} — {locale === "ar" ? cert.courseTitleAr : cert.courseTitleEn}
                  </td>
                  <td className="p-3">{cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString(locale) : "—"}</td>
                  <td className="p-3">{cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString(locale) : "—"}</td>
                  <td className="p-3">
                    <a href={`/api/certificates/${cert.id}/download`} className="text-primary hover:underline">
                      {t("download")}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
