import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { getEmployeeById, listActiveJobRoles } from "@/modules/employees/queries";
import { listDocumentsForEmployee } from "@/modules/platform/storage/queries";
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

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-lg">
        <Link href="/dashboard/employees" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <EditEmployeeForm employee={employee} jobRoles={jobRoles} locale={locale} />
      <DocumentUpload companyId={context.companyId} employeeId={employee.id} documents={documents} />
    </div>
  );
}
