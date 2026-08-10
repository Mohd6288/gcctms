import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import {
  listDirectoryCompanies,
  listDirectoryEmployees,
  listStaffAccounts,
} from "@/modules/directory/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

// Built for the real number: this platform expects several thousand
// employees, so the employee list is searched and paged on the server and
// says how many it did not show. The previous version took `limit 1000` and
// stayed silent about the rest, which is the failure mode that matters — a
// truncated list looks exactly like a complete one.
//
// Search and paging travel in the URL, so a page of results is a link an
// auditor can send to somebody else, and the whole screen needs no client JS.
export default async function AuditorDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, page: pageParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.directory");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const page = Math.max(1, Number(pageParam) || 1);
  // Sequential, never Promise.all — see db/index.ts.
  const employees = await listDirectoryEmployees({ q, page });
  const companies = await listDirectoryCompanies();
  const accounts = await listStaffAccounts();

  const from = employees.total === 0 ? 0 : (employees.page - 1) * employees.pageSize + 1;
  const to = Math.min(employees.page * employees.pageSize, employees.total);
  const lastPage = Math.max(1, Math.ceil(employees.total / employees.pageSize));
  const search = q?.trim() ?? "";
  const pageHref = (p: number) => `/auditor/directory?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(p) })}`;
  const exportHref = `/api/auditor/export/employees${search ? `?q=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("employeesTitle", { count: employees.total })}</h2>
          <Button asChild size="sm" variant="outline">
            {/* Exports everything the current search matches, not the page on
                screen — the export is what an auditor takes away. */}
            <a href={exportHref}>{t("exportMatching")}</a>
          </Button>
        </div>

        {/* A plain GET form: no client JS, and the result is a shareable URL. */}
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={search} placeholder={t("searchPlaceholder")} className="max-w-sm" aria-label={t("searchPlaceholder")} />
          <Button type="submit" size="sm">
            {t("searchAction")}
          </Button>
          {search ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/auditor/directory">{t("clearSearch")}</Link>
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">{t("searchHint")}</span>
        </form>

        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("colName")}</th>
                <th className="p-3 text-start font-medium">{t("colIqama")}</th>
                <th className="p-3 text-start font-medium">{t("colCompany")}</th>
                <th className="p-3 text-start font-medium">{t("colRegion")}</th>
                <th className="p-3 text-start font-medium">{t("colRole")}</th>
                <th className="p-3 text-start font-medium">{t("colValidCerts")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={6}>
                    {search ? t("noMatches", { q: search }) : t("rosterEmpty")}
                  </td>
                </tr>
              ) : (
                employees.rows.map((employee) => (
                  <tr key={employee.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <Link href={`/auditor/employees/${employee.id}`} className="text-primary hover:underline">
                        {locale === "ar" ? employee.fullNameAr : employee.fullNameEn}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs">{employee.nationalIdMasked ?? "—"}</td>
                    <td className="p-3">
                      <Link href={`/auditor/companies/${employee.companyId}`} className="text-primary hover:underline">
                        {employee.companyName}
                      </Link>
                    </td>
                    <td className="p-3">{employee.companyRegion ?? "—"}</td>
                    <td className="p-3">{employee.jobRoleName ?? "—"}</td>
                    <td className="p-3">{employee.validCertificates}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Says what it is showing and what it is not. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("showingRange", { from, to, total: employees.total })}</p>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" disabled={employees.page <= 1}>
              <Link href={pageHref(Math.max(1, employees.page - 1))}>{t("prevPage")}</Link>
            </Button>
            <span className="text-xs text-muted-foreground">{t("pageOf", { page: employees.page, last: lastPage })}</span>
            <Button asChild size="sm" variant="outline" disabled={employees.page >= lastPage}>
              <Link href={pageHref(Math.min(lastPage, employees.page + 1))}>{t("nextPage")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("companiesTitle", { count: companies.length })}</h2>
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("colName")}</th>
                <th className="p-3 text-start font-medium">{t("colCr")}</th>
                <th className="p-3 text-start font-medium">{t("colRegion")}</th>
                <th className="p-3 text-start font-medium">{t("colEmployees")}</th>
                <th className="p-3 text-start font-medium">{t("colValidCerts")}</th>
                <th className="p-3 text-start font-medium">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link href={`/auditor/companies/${company.id}`} className="text-primary hover:underline">
                      {company.name}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs">{company.crNumber}</td>
                  <td className="p-3">{company.region ?? "—"}</td>
                  <td className="p-3">{company.employees}</td>
                  <td className="p-3">{company.validCertificates}</td>
                  <td className="p-3">{company.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("accountsTitle", { count: accounts.length })}</h2>
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("colName")}</th>
                <th className="p-3 text-start font-medium">{t("colRole")}</th>
                <th className="p-3 text-start font-medium">{t("colEmail")}</th>
                <th className="p-3 text-start font-medium">{t("colRegion")}</th>
                <th className="p-3 text-start font-medium">{t("colLastSignIn")}</th>
                <th className="p-3 text-start font-medium">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.userId} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link href={`/auditor/people/${account.userId}`} className="text-primary hover:underline">
                      {account.fullName}
                    </Link>
                  </td>
                  <td className="p-3">{account.role}</td>
                  <td className="p-3 text-xs text-muted-foreground">{account.email ?? "—"}</td>
                  <td className="p-3">{account.region ?? t("regionUnscoped")}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleDateString(locale) : t("neverSignedIn")}
                  </td>
                  <td className="p-3">{account.actionsTaken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
