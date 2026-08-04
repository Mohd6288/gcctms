import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listActiveCourses } from "@/modules/requests/queries";
import { listEmployeesForCompany } from "@/modules/employees/queries";
import { getCompanyEmployeeIdsWithNationalId } from "@/modules/platform/storage/queries";
import { RequestWizard } from "../[id]/request-wizard";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function NewRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const [courses, companyEmployees, employeeIdsWithNationalId] = await Promise.all([
    listActiveCourses(context.companyId),
    listEmployeesForCompany(context.companyId),
    getCompanyEmployeeIdsWithNationalId(context.companyId),
  ]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <RequestWizard
        requestId={null}
        initialFields={{
          courseId: null,
          preferredRegion: null,
          preferredCity: null,
          preferredTrainingType: null,
          preferredStartDate: null,
          preferredEndDate: null,
          notes: null,
        }}
        companyId={context.companyId}
        courses={courses}
        companyEmployees={companyEmployees.map((e) => ({
          id: e.id,
          fullNameEn: e.fullNameEn,
          fullNameAr: e.fullNameAr,
          hasNationalId: employeeIdsWithNationalId.has(e.id),
        }))}
        initialSelectedEmployeeIds={[]}
        initialRequestDocs={[]}
        locale={locale}
      />
    </div>
  );
}
