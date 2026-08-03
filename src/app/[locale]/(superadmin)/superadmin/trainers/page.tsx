import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listTrainers } from "@/modules/catalog/queries";
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
  const trainers = authorize("manage_trainer_roster", context) ? await listTrainers() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CreateTrainerForm />
        <div className="flex-1">
          <TrainerRoster trainers={trainers} />
        </div>
      </div>
    </div>
  );
}
