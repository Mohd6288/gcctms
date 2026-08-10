import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listDirectoryCompanies, listDirectoryEmployees, listStaffAccounts } from "@/modules/directory/queries";
import { AuditTable, type AuditColumn } from "@/components/audit-table";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

type CompanyRow = { name: string; crNumber: string; region: string | null; city: string | null; status: string; employees: number; validCertificates: number };
type EmployeeRow = { name: string; iqama: string | null; company: string; region: string | null; jobRole: string | null; status: string; validCertificates: number };
type AccountRow = { name: string; role: string; email: string | null; region: string | null; lastSignIn: string | null; actions: number; status: string };

// Everyone and everything on the platform, in one place, each row opening a
// profile. The tables are the auditor portal's existing AuditTable so every
// tab keeps its CSV export — collecting data is half of what this role does.
export default async function AuditorDirectoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.directory");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  // Sequential, never Promise.all — see db/index.ts.
  const companies = await listDirectoryCompanies();
  const employees = await listDirectoryEmployees();
  const accounts = await listStaffAccounts();
  const day = (v: Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : null);

  const companyColumns: AuditColumn<CompanyRow>[] = [
    { key: "name", label: t("colName") },
    { key: "crNumber", label: t("colCr") },
    { key: "region", label: t("colRegion") },
    { key: "city", label: t("colCity") },
    { key: "employees", label: t("colEmployees") },
    { key: "validCertificates", label: t("colValidCerts") },
    { key: "status", label: t("colStatus") },
  ];
  const employeeColumns: AuditColumn<EmployeeRow>[] = [
    { key: "name", label: t("colName") },
    { key: "iqama", label: t("colIqama") },
    { key: "company", label: t("colCompany") },
    { key: "region", label: t("colRegion") },
    { key: "jobRole", label: t("colRole") },
    { key: "validCertificates", label: t("colValidCerts") },
    { key: "status", label: t("colStatus") },
  ];
  const accountColumns: AuditColumn<AccountRow>[] = [
    { key: "name", label: t("colName") },
    { key: "role", label: t("colRole") },
    { key: "email", label: t("colEmail") },
    { key: "region", label: t("colRegion") },
    { key: "lastSignIn", label: t("colLastSignIn") },
    { key: "actions", label: t("colActions") },
    { key: "status", label: t("colStatus") },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {/* Said out loud so nobody assumes the export was scrubbed by
            accident — the same note the certificates screen carries. */}
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("companiesTitle", { count: companies.length })}</h2>
        <div className="flex flex-wrap gap-2">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/auditor/companies/${company.id}`}
              className="rounded-full px-3 py-1 text-xs ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              {company.name}
            </Link>
          ))}
        </div>
        <AuditTable
          columns={companyColumns}
          rows={companies.map((c) => ({
            name: c.name,
            crNumber: c.crNumber,
            region: c.region,
            city: c.city,
            status: c.status,
            employees: c.employees,
            validCertificates: c.validCertificates,
          }))}
          fileName="companies"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("employeesTitle", { count: employees.length })}</h2>
        <p className="text-xs text-muted-foreground">{t("employeesHint")}</p>
        <div className="flex flex-wrap gap-2">
          {employees.slice(0, 40).map((employee) => (
            <Link
              key={employee.id}
              href={`/auditor/employees/${employee.id}`}
              className="rounded-full px-3 py-1 text-xs ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              {locale === "ar" ? employee.fullNameAr : employee.fullNameEn}
            </Link>
          ))}
        </div>
        <AuditTable
          columns={employeeColumns}
          rows={employees.map((e) => ({
            name: locale === "ar" ? e.fullNameAr : e.fullNameEn,
            // Masked here and therefore masked in the CSV: the export is the
            // most copied artefact this portal produces.
            iqama: e.nationalIdMasked,
            company: e.companyName,
            region: e.companyRegion,
            jobRole: e.jobRoleName,
            status: e.status,
            validCertificates: e.validCertificates,
          }))}
          fileName="employees"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("accountsTitle", { count: accounts.length })}</h2>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <Link
              key={account.userId}
              href={`/auditor/people/${account.userId}`}
              className="rounded-full px-3 py-1 text-xs ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              {account.fullName}
            </Link>
          ))}
        </div>
        <AuditTable
          columns={accountColumns}
          rows={accounts.map((a) => ({
            name: a.fullName,
            role: a.role,
            email: a.email,
            region: a.region,
            lastSignIn: day(a.lastSignInAt),
            actions: a.actionsTaken,
            status: a.active ? t("accountActive") : t("accountInactive"),
          }))}
          fileName="accounts"
        />
      </section>
    </div>
  );
}
