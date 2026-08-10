import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { getContext } from "@/modules/platform/auth/service";
import { listEmployeesForCompany } from "@/modules/employees/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.employees");

  // (contractor) layout already gates on role — companyId is guaranteed
  // non-null for a signed-in contractor_manager.
  const context = await getContext();
  const employees = context?.companyId ? await listEmployeesForCompany(context.companyId) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="-mt-4 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        <Button asChild>
          <Link href="/dashboard/employees/new">{t("addNew")}</Link>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableName")}</th>
              <th className="p-3 text-start font-medium">{t("tableRole")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              <th className="p-3 text-start font-medium">{t("tableActions")}</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0">
                  <td className="p-3">{locale === "ar" ? employee.fullNameAr : employee.fullNameEn}</td>
                  <td className="p-3">{employee.jobRoleNameEn}</td>
                  <td className="p-3">{employee.status === "active" ? t("statusActive") : t("statusInactive")}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/employees/${employee.id}`} className="text-primary hover:underline">
                      {t("edit")}
                    </Link>
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
