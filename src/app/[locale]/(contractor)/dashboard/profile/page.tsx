import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { getCompanyById } from "@/modules/companies/queries";
import { listRequestsForCompany } from "@/modules/requests/queries";
import { listEmployeesForCompany } from "@/modules/employees/queries";
import { ProfileForm } from "./profile-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ContractorProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.profile");

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const company = await getCompanyById(context.companyId);
  if (!company) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const [requests, employees] = await Promise.all([
    listRequestsForCompany(context.companyId),
    listEmployeesForCompany(context.companyId),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="w-full max-w-2xl text-lg font-semibold">{t("title")}</h1>
      <ProfileForm company={company} requestCount={requests.length} employeeCount={employees.length} />
    </div>
  );
}
