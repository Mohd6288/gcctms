import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listCompanies } from "@/modules/companies/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.companies");

  const context = await getContext();
  const companies = authorize("manage_companies", context) ? await listCompanies(context?.region) : [];

  const statusLabels: Record<string, string> = {
    active: t("statusActive"),
    pending: t("statusPending"),
    suspended: t("statusSuspended"),
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
      <p className="text-sm text-muted-foreground">{t("pendingNote")}</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableName")}</th>
              <th className="p-3 text-start font-medium">{t("tableCr")}</th>
              <th className="p-3 text-start font-medium">{t("tableContact")}</th>
              <th className="p-3 text-start font-medium">{t("tableCity")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link href={`/admin/companies/${company.id}`} className="text-primary hover:underline">
                      {company.name}
                    </Link>
                  </td>
                  <td className="p-3">{company.crNumber}</td>
                  <td className="p-3">
                    {company.contactName} · {company.contactEmail}
                  </td>
                  <td className="p-3">{company.city}</td>
                  <td className="p-3">{statusLabels[company.status] ?? company.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
