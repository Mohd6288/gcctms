import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listCourses, listTrainerCourses, listTrainers } from "@/modules/catalog/queries";
import { CreateTrainerForm } from "./create-trainer-form";
import { TrainerRoster } from "./trainer-roster";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function TrainersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.trainers");

  const context = await getContext();
  const allowed = authorize("manage_trainer_roster", context);
  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // Supabase pooler (see db/index.ts).
  const trainers = allowed ? await listTrainers() : [];
  const trainerCourses = allowed ? await listTrainerCourses() : [];
  const courses = allowed ? (await listCourses()).filter((c) => c.active) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CreateTrainerForm courses={courses} locale={locale} />
        <div className="min-w-0 flex-1">
          <TrainerRoster trainers={trainers} courses={courses} trainerCourses={trainerCourses} locale={locale} />
        </div>
      </div>
    </div>
  );
}
