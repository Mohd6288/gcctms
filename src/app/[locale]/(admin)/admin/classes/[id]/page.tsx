import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listTrainers, listTrainingCenters } from "@/modules/catalog/queries";
import { getClassById, listActiveEnrollmentRequestItemIds, listEnrollmentsForClass, listSchedulableRequestItems } from "@/modules/scheduling/queries";
import { ClassDetail } from "./class-detail";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.classes.detail");

  const context = await getContext();
  const classId = Number(id);
  const cls = Number.isInteger(classId) ? await getClassById(classId) : null;

  if (!authorize("schedule_classes", context) || !cls) {
    redirect({ href: "/admin/classes", locale });
    return null;
  }

  const [enrollments, trainers, centers, pooled, activeIds] = await Promise.all([
    listEnrollmentsForClass(classId),
    listTrainers(),
    listTrainingCenters(),
    listSchedulableRequestItems(),
    listActiveEnrollmentRequestItemIds(),
  ]);

  // "Available in this region" pool: billable, ready_for_scheduling, this
  // class's region, no active enrollment anywhere yet.
  const availablePool = pooled.filter((p) => !activeIds.has(p.requestItemId) && p.assignedRegion === cls.region);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-3xl">
        <Link href="/admin/classes" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <ClassDetail
        cls={cls}
        enrollments={enrollments}
        trainers={trainers.filter((tr) => tr.active)}
        centers={centers.filter((c) => c.active)}
        availablePool={availablePool}
        locale={locale}
      />
    </div>
  );
}
