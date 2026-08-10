import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { getEmployeeById, listActiveJobRoles } from "@/modules/employees/queries";
import { listDocumentsForEmployee, listExternalCertificatesForCompany } from "@/modules/platform/storage/queries";
import { listActiveCourses } from "@/modules/requests/queries";
import { ExternalCertificatePanel } from "@/components/documents/external-certificate-panel";
import { loadEmployeeProfile, notAuthorizedToNull } from "@/modules/directory/employee-profile-data";
import { EmployeeProfile } from "@/components/profile/employee-profile";
import { EditEmployeeForm } from "./edit-employee-form";
import { DocumentUpload } from "./document-upload";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// See admin/classes/[id]/page.tsx's comment — generateStaticParams only
// covers `locale`, so every real [id] falls back to on-demand rendering;
// without this, the cookies()/DB reads below throw DYNAMIC_SERVER_USAGE in
// production.
export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.employees");

  const context = await getContext();
  const employeeId = Number(id);
  const employee = Number.isInteger(employeeId) ? await getEmployeeById(employeeId) : null;

  if (!context?.companyId || !employee || employee.companyId !== context.companyId) {
    redirect({ href: "/dashboard/employees", locale });
    return null;
  }

  const [jobRoles, documents] = await Promise.all([listActiveJobRoles(context.companyId), listDocumentsForEmployee(employee.id)]);
  // Filing an existing certificate has to work outside a request too: it
  // needs admin verification before it counts, and a contractor blocked at
  // submit shouldn't have to keep a half-built request open while waiting.
  const courses = await listActiveCourses(context.companyId);
  const externalCertificates = await listExternalCertificatesForCompany(context.companyId);

  // The same profile the admin and auditor see, scoped by
  // assertCanViewCompany to this contractor's own company.
  const profile = await loadEmployeeProfile(context, employee.id).catch(notAuthorizedToNull);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-lg">
        <Link href="/dashboard/employees" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      {profile ? (
        <div className="w-full max-w-4xl">
          <EmployeeProfile
            employee={profile.employee}
            identity={profile.identity}
            progress={profile.progress}
            certificates={profile.certificates}
            training={profile.training}
            history={profile.history}
            locale={locale}
            certificateHref={(certificateId) => `/api/certificates/${certificateId}/download`}
          />
        </div>
      ) : null}

      <EditEmployeeForm employee={employee} jobRoles={jobRoles} locale={locale} />
      <DocumentUpload companyId={context.companyId} employeeId={employee.id} documents={documents} />
      <div className="w-full max-w-lg">
        <ExternalCertificatePanel
          companyId={context.companyId}
          employeeId={employee.id}
          locale={locale}
          courses={courses}
          certificates={externalCertificates.filter((c) => c.employeeId === employee.id)}
        />
      </div>
    </div>
  );
}
