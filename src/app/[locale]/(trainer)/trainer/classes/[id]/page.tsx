import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { getCourseById } from "@/modules/catalog/queries";
import { listAttendanceForClass, listLatestExamResultsForClass } from "@/modules/delivery/queries";
import { getSessionDates } from "@/modules/delivery/service";
import { getClassById, listEnrollmentsForClass } from "@/modules/scheduling/queries";
import { ClassDeliveryDetail } from "./class-delivery-detail";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function TrainerClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("trainer.classDetail");

  const context = await getContext();
  const classId = Number(id);
  const cls = Number.isInteger(classId) ? await getClassById(classId) : null;

  if (!cls || (context?.role === "trainer" && cls.trainerId !== context.trainerId)) {
    redirect({ href: "/trainer/classes", locale });
    return null;
  }

  const [enrollments, attendanceRows, examResultRows, course] = await Promise.all([
    listEnrollmentsForClass(classId),
    listAttendanceForClass(classId),
    listLatestExamResultsForClass(classId),
    getCourseById(cls.courseId),
  ]);

  const roster = enrollments.filter((e) => e.status === "enrolled");
  const sessionDates = getSessionDates(cls.startDate, cls.endDate);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-4xl">
        <Link href="/trainer/classes" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <ClassDeliveryDetail
        cls={cls}
        roster={roster}
        sessionDates={sessionDates}
        attendance={attendanceRows}
        examResults={examResultRows}
        hasExam={course?.examId != null}
        locale={locale}
      />
    </div>
  );
}
