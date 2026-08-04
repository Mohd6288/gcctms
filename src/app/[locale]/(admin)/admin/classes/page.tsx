import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listClasses } from "@/modules/scheduling/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminClassesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.classes");

  const context = await getContext();
  const classes = authorize("schedule_classes", context) ? await listClasses() : [];

  const statusLabels: Record<string, string> = {
    scheduled: t("statusScheduled"),
    in_progress: t("statusInProgress"),
    completed: t("statusCompleted"),
    cancelled: t("statusCancelled"),
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/classes/new">{t("newClass")}</Link>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableTrainer")}</th>
              <th className="p-3 text-start font-medium">{t("tableRegion")}</th>
              <th className="p-3 text-start font-medium">{t("tableDates")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link href={`/admin/classes/${cls.id}`} className="text-primary hover:underline">
                      {cls.courseCode} {locale === "ar" ? cls.courseTitleAr : cls.courseTitleEn}
                    </Link>
                  </td>
                  <td className="p-3">{cls.trainerFullName}</td>
                  <td className="p-3">{cls.region}</td>
                  <td className="p-3">
                    {cls.startDate} – {cls.endDate}
                  </td>
                  <td className="p-3">{statusLabels[cls.status] ?? cls.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
