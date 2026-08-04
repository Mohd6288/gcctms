import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listClassesForTrainer } from "@/modules/scheduling/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function TrainerHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("trainer.dashboard");

  const context = await getContext();
  const classes = context?.trainerId ? await listClassesForTrainer(context.trainerId) : [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = classes.filter((c) => c.status !== "completed" && c.endDate >= today).slice(0, 5);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((cls) => (
            <li key={cls.id}>
              <Link href={`/trainer/classes/${cls.id}`} className="block rounded-lg border border-border p-3 text-sm hover:bg-muted">
                <span className="font-medium">{locale === "ar" ? cls.courseTitleAr : cls.courseTitleEn}</span>
                <span className="ml-2 text-muted-foreground">
                  {cls.startDate} – {cls.endDate} · {cls.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/trainer/classes" className="text-sm text-primary hover:underline">
        {t("viewAll")}
      </Link>
    </div>
  );
}
