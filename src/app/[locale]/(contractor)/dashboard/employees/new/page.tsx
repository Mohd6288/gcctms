import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listActiveJobRoles } from "@/modules/employees/queries";
import { CreateEmployeeForm } from "./create-employee-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function NewEmployeePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const context = await getContext();
  const companyId = context?.companyId;
  if (!companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const jobRoles = await listActiveJobRoles(companyId);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <CreateEmployeeForm companyId={companyId} jobRoles={jobRoles} locale={locale} />
    </div>
  );
}
