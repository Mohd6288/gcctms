import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import {
  getCourseById,
  listAllJobRoles,
  listCourseJobRoleIds,
  listCoursePrerequisiteIds,
  listCourses,
  listPricingForCourse,
} from "@/modules/catalog/queries";
import { CourseDetail } from "./course-detail";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.catalog");

  const context = await getContext();
  const courseId = Number(id);
  const course = Number.isInteger(courseId) ? await getCourseById(courseId) : null;

  if (!authorize("manage_catalog", context) || !course) {
    redirect({ href: "/superadmin/catalog", locale });
    return null;
  }

  const [jobRoles, selectedJobRoleIds, allCourses, selectedPrerequisiteCourseIds, pricingRows] = await Promise.all([
    listAllJobRoles(),
    listCourseJobRoleIds(courseId),
    listCourses(),
    listCoursePrerequisiteIds(courseId),
    listPricingForCourse(courseId),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-2xl">
        <Link href="/superadmin/catalog" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <CourseDetail
        course={course}
        jobRoles={jobRoles}
        initialSelectedJobRoleIds={Array.from(selectedJobRoleIds)}
        otherCourses={allCourses.filter((c) => c.id !== courseId)}
        initialSelectedPrerequisiteCourseIds={Array.from(selectedPrerequisiteCourseIds)}
        pricingRows={pricingRows}
        locale={locale}
      />
    </div>
  );
}
