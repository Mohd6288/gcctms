import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAllEmployees } from "@/modules/employees/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminEmployeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.employees");

  const context = await getContext();
  const employees = authorize("manage_employees", context) ? await listAllEmployees(context?.region) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableName")}</th>
              <th className="p-3 text-start font-medium">{t("tableCompany")}</th>
              <th className="p-3 text-start font-medium">{t("tableRole")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
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
                  <td className="p-3">
                    <Link href={`/admin/employees/${employee.id}`} className="text-primary hover:underline">
                      {locale === "ar" ? employee.fullNameAr : employee.fullNameEn}
                    </Link>
                  </td>
                  <td className="p-3">{employee.companyName}</td>
                  <td className="p-3">{employee.jobRoleNameEn}</td>
                  <td className="p-3">{employee.status === "active" ? t("statusActive") : t("statusInactive")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
