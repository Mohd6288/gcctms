import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listCourses } from "@/modules/catalog/queries";
import { CreatePanel } from "@/components/ui/create-panel";
import { CreateCourseForm } from "./create-course-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.catalog");

  const context = await getContext();
  const courses = authorize("manage_catalog", context)
    ? await listCourses()
    : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="-mt-4 max-w-3xl text-sm text-muted-foreground">
        {t("description")}
      </p>
      <CreatePanel
        title={t("createTitle")}
        addLabel={t("addAction")}
        cancelLabel={t("cancel")}
        defaultOpen={courses.length === 0}
      >
        <CreateCourseForm />
      </CreatePanel>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCode")}</th>
              <th className="p-3 text-start font-medium">{t("tableTitle")}</th>
              <th className="p-3 text-start font-medium">
                {t("tableDuration")}
              </th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              courses.map((course) => (
                <tr
                  key={course.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="p-3">{course.code}</td>
                  <td className="p-3">
                    {locale === "ar" ? course.titleAr : course.titleEn}
                  </td>
                  <td className="p-3">{course.durationHours}</td>
                  <td className="p-3">
                    {course.active ? t("statusActive") : t("statusInactive")}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/superadmin/catalog/${course.id}`}
                      className="text-primary hover:underline"
                    >
                      {t("view")}
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
