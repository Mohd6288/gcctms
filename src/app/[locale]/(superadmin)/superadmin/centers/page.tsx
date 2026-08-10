import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listTrainingCenters } from "@/modules/catalog/queries";
import { CreateCenterForm } from "./create-center-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function CentersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.centers");

  const context = await getContext();
  const centers = authorize("manage_catalog", context) ? await listTrainingCenters() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="-mt-4 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CreateCenterForm />
        <div className="flex-1 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("tableName")}</th>
                <th className="p-3 text-start font-medium">{t("tableCity")}</th>
                <th className="p-3 text-start font-medium">{t("tableCapacity")}</th>
                <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {centers.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                centers.map((center) => (
                  <tr key={center.id} className="border-b border-border last:border-0">
                    <td className="p-3">{center.name}</td>
                    <td className="p-3">{center.city ?? "—"}</td>
                    <td className="p-3">{center.capacity ?? "—"}</td>
                    <td className="p-3">{center.active ? t("statusActive") : t("statusInactive")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
