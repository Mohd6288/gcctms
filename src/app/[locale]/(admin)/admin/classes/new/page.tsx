import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listCourses, listTrainers, listTrainingCenters } from "@/modules/catalog/queries";
import { listCompanies } from "@/modules/companies/queries";
import { NewClassForm } from "./new-class-form";
import { REGIONS } from "@/lib/regions";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}


export default async function NewClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ region?: string }>;
}) {
  const { locale } = await params;
  const { region } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("admin.classes.form");

  const context = await getContext();
  if (!authorize("schedule_classes", context)) {
    redirect({ href: "/admin/classes", locale });
    return null;
  }

  const [courses, trainers, centers, companies] = await Promise.all([
    listCourses(),
    listTrainers(),
    listTrainingCenters(),
    listCompanies(context?.region),
  ]);
  const initialRegion = (REGIONS as readonly string[]).includes(region ?? "") ? (region as (typeof REGIONS)[number]) : undefined;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-xl">
        <Link href="/admin/classes" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <NewClassForm
        courses={courses.filter((c) => c.active)}
        trainers={trainers.filter((t) => t.active)}
        centers={centers.filter((c) => c.active)}
        companies={companies}
        initialRegion={initialRegion}
        locale={locale}
      />
    </div>
  );
}
