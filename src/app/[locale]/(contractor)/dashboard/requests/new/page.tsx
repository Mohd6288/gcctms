import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listActiveCourses, listEffectiveCoursePrices } from "@/modules/requests/queries";
import { listActiveJobRoles, listEmployeesForCompany } from "@/modules/employees/queries";
import { listEmployeeDocumentsForCompany, listExternalCertificatesForCompany } from "@/modules/platform/storage/queries";
import { listActiveCities } from "@/modules/catalog/queries";
import { DEFAULT_VAT_RATE } from "@/db/schema/requests";
import { RequestWizard } from "../[id]/request-wizard";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function NewRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ courseId?: string; employeeId?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  // Populated when arriving from the "Start OHS request" link in the
  // wizard's missing-prerequisite hint (request-wizard.tsx) — pre-selects
  // the course/employee so a contractor doesn't have to redo that lookup.
  const { courseId: courseIdParam, employeeId: employeeIdParam } = await searchParams;
  const prefilledCourseId = courseIdParam ? Number(courseIdParam) : null;
  const prefilledEmployeeId = employeeIdParam ? Number(employeeIdParam) : null;

  const [courses, companyEmployees, employeeDocuments, jobRoles] = await Promise.all([
    listActiveCourses(context.companyId),
    listEmployeesForCompany(context.companyId),
    listEmployeeDocumentsForCompany(context.companyId),
    listActiveJobRoles(context.companyId),
  ]);
  // Sequential, not a fifth entry in the Promise.all above — concurrent
  // Drizzle calls stall against the pooler under load.
  const externalCertificates = await listExternalCertificatesForCompany(context.companyId);
  const cities = await listActiveCities();
  const coursePrices = await listEffectiveCoursePrices(courses.map((c) => c.id));

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <RequestWizard
        requestId={null}
        initialFields={{
          courseId: prefilledCourseId && courses.some((c) => c.id === prefilledCourseId) ? prefilledCourseId : null,
          preferredRegion: null,
          preferredCity: null,
          preferredTrainingType: null,
          notes: null,
        }}
        companyId={context.companyId}
        courses={courses}
        companyEmployees={companyEmployees.map((e) => ({
          id: e.id,
          fullNameEn: e.fullNameEn,
          fullNameAr: e.fullNameAr,
        }))}
        initialSelectedEmployeeIds={
          prefilledEmployeeId && companyEmployees.some((e) => e.id === prefilledEmployeeId) ? [prefilledEmployeeId] : []
        }
        initialRequestDocs={[]}
        employeeDocuments={employeeDocuments}
        externalCertificates={externalCertificates}
        cities={cities}
        coursePrices={coursePrices}
        vatRate={DEFAULT_VAT_RATE}
        jobRoles={jobRoles}
        locale={locale}
      />
    </div>
  );
}
