import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listCities } from "@/modules/catalog/queries";
import { CitiesManager } from "./cities-manager";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

// The cities a course can be delivered in, per region. These used to be a
// hardcoded map in src/lib/regions.ts, so adding one meant a code change;
// they're rows now (0032_cities.sql) and training_requests.preferred_city
// is a foreign key onto them.
export default async function CitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.cities");

  const context = await getContext();
  const cities = authorize("manage_catalog", context) ? await listCities() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CitiesManager cities={cities} locale={locale} />
    </div>
  );
}
