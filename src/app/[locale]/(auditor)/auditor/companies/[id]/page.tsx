import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { assertCanViewCompany } from "@/modules/directory/access";
import {
  getCompanyProfile,
  getCompanyProgress,
  getEntityHistory,
  listCompanyRequests,
  listCompanyRoster,
} from "@/modules/directory/queries";
import { ProfileHeader, ProgressCard } from "@/components/profile/profile-header";
import { Timeline } from "@/components/profile/timeline";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function AuditorCompanyProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.directory");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const companyId = Number(id);
  const company = Number.isInteger(companyId) ? await getCompanyProfile(companyId) : null;
  if (!company) {
    redirect({ href: "/auditor/directory", locale });
    return null;
  }
  await assertCanViewCompany(context, companyId);

  // Sequential, never Promise.all — see db/index.ts.
  const progress = await getCompanyProgress(companyId);
  const roster = await listCompanyRoster(companyId);
  const requests = await listCompanyRequests(companyId);
  const history = await getEntityHistory("company", companyId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Link href="/auditor/directory" className="text-sm text-muted-foreground hover:underline">
        {t("backToDirectory")}
      </Link>

      <ProfileHeader
        name={company.name}
        subtitle={`${company.region ?? "—"}${company.city ? ` · ${company.city}` : ""}`}
        chips={[{ label: company.status, tone: company.status === "active" ? "success" : "muted" }]}
        facts={[
          { label: t("colCr"), value: company.crNumber, mono: true },
          { label: t("colContact"), value: company.contactName },
          { label: t("colEmail"), value: company.contactEmail },
          { label: t("colPhone"), value: company.contactPhone },
          { label: t("colRegistered"), value: new Date(company.createdAt).toLocaleDateString(locale) },
        ]}
      />

      <ProgressCard
        title={t("companyProgress")}
        stats={[
          { label: t("statEmployees"), value: progress.employees },
          { label: t("statOpenRequests"), value: progress.open_requests },
          { label: t("statValidCerts"), value: progress.certificates_valid, tone: "success" },
          {
            label: t("statExpiringCerts"),
            value: progress.certificates_expiring,
            tone: progress.certificates_expiring > 0 ? "warning" : undefined,
          },
        ]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("rosterTitle", { count: roster.length })}</h2>
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("colName")}</th>
                <th className="p-3 text-start font-medium">{t("colIqama")}</th>
                <th className="p-3 text-start font-medium">{t("colRole")}</th>
                <th className="p-3 text-start font-medium">{t("colValidCerts")}</th>
                <th className="p-3 text-start font-medium">{t("colIdentity")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={5}>
                    {t("rosterEmpty")}
                  </td>
                </tr>
              ) : (
                roster.map((person) => (
                  <tr key={person.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <Link href={`/auditor/employees/${person.id}`} className="text-primary hover:underline">
                        {locale === "ar" ? person.fullNameAr : person.fullNameEn}
                      </Link>
                    </td>
                    {/* Masked: the last four digits are enough to match a
                        person against a paper record. */}
                    <td className="p-3 font-mono text-xs">{person.nationalIdMasked ?? "—"}</td>
                    <td className="p-3">{person.jobRoleName ?? "—"}</td>
                    <td className="p-3">{person.validCertificates}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          person.iqamaVerified ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                        }`}
                      >
                        {person.iqamaVerified ? t("identityVerified") : t("identityUnverified")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("requestsTitle", { count: requests.length })}</h2>
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("colCourse")}</th>
                <th className="p-3 text-start font-medium">{t("colCandidates")}</th>
                <th className="p-3 text-start font-medium">{t("colStatus")}</th>
                <th className="p-3 text-start font-medium">{t("colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    {t("requestsEmpty")}
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      {request.courseCode} — {request.courseTitleEn}
                    </td>
                    <td className="p-3">{request.candidates}</td>
                    <td className="p-3">{request.status}</td>
                    <td className="p-3">{new Date(request.createdAt).toLocaleDateString(locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Timeline entries={history} locale={locale} />
    </div>
  );
}
