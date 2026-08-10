import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listTrainerCourses, listTrainers } from "@/modules/catalog/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Read-only roster for the admin who schedules classes: who can teach what,
// and how to reach them. Adding a trainer or changing their competencies is
// still super_admin's (/superadmin/trainers) — this screen has no mutations.
export default async function AdminTrainersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.trainers");

  const context = await getContext();
  const allowed = authorize("view_trainer_roster", context);
  // Sequential, never Promise.all — concurrent Drizzle calls stall against
  // the Supabase pooler (see db/index.ts).
  const trainers = allowed ? await listTrainers() : [];
  const trainerCourses = allowed ? await listTrainerCourses() : [];

  const coursesByTrainer = new Map<number, typeof trainerCourses>();
  for (const row of trainerCourses) {
    const list = coursesByTrainer.get(row.trainerId) ?? [];
    list.push(row);
    coursesByTrainer.set(row.trainerId, list);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableName")}</th>
              <th className="p-3 text-start font-medium">{t("tableContact")}</th>
              <th className="p-3 text-start font-medium">{t("tableCourses")}</th>
              <th className="p-3 text-start font-medium">{t("tableQualifications")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {trainers.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              trainers.map((trainer) => {
                const taught = coursesByTrainer.get(trainer.id) ?? [];
                return (
                  <tr key={trainer.id} className="border-b border-border align-top last:border-0">
                    <td className="p-3 font-medium">{trainer.fullName}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <span>{trainer.email ?? "—"}</span>
                        {trainer.phone ? <span className="text-xs text-muted-foreground">{trainer.phone}</span> : null}
                      </div>
                    </td>
                    <td className="p-3">
                      {taught.length === 0 ? (
                        // A trainer with no competencies can still be assigned
                        // to a class — say so here rather than let an admin
                        // read a blank cell as "data missing".
                        <span className="text-xs text-muted-foreground">{t("noCourses")}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {taught.map((course) => (
                            <span
                              key={course.courseId}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs"
                              title={locale === "ar" ? course.titleAr : course.titleEn}
                            >
                              {course.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 max-w-xs text-xs text-muted-foreground">{trainer.qualifications ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-xs ${
                            trainer.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {trainer.active ? t("statusActive") : t("statusInactive")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {trainer.hasLogin ? t("hasLogin") : t("noLogin")}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
