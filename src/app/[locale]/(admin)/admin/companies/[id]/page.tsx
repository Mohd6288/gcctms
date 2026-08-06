import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getCompanyById } from "@/modules/companies/queries";
import { listEmployeesForCompany } from "@/modules/employees/queries";
import { listRequestsForCompany } from "@/modules/requests/queries";
import { CompanyDetail } from "./company-detail";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// See admin/classes/[id]/page.tsx's comment — generateStaticParams only
// covers `locale`, so every real [id] falls back to on-demand rendering;
// without this, the cookies()/DB reads below throw DYNAMIC_SERVER_USAGE in
// production.
export const dynamic = "force-dynamic";

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.companies.detail");

  const context = await getContext();
  const companyId = Number(id);
  const company = Number.isInteger(companyId) ? await getCompanyById(companyId) : null;

  // See admin/requests/[id]/page.tsx's identical note — Drizzle bypasses
  // RLS, and this detail route is reachable directly by id regardless of
  // whether it appeared in the (region-scoped) list.
  const regionDenied = context?.region != null && company?.region !== context.region;

  if (!authorize("manage_companies", context) || !company || regionDenied) {
    redirect({ href: "/admin/companies", locale });
    return null;
  }

  const [requests, employees] = await Promise.all([listRequestsForCompany(companyId), listEmployeesForCompany(companyId)]);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-3xl">
        <Link href="/admin/companies" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <CompanyDetail company={company} requests={requests} employees={employees} locale={locale} />
    </div>
  );
}
