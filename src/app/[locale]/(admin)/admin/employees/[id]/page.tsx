import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { loadEmployeeProfile, notAuthorizedToNull } from "@/modules/directory/employee-profile-data";
import { EmployeeProfile } from "@/components/profile/employee-profile";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// generateStaticParams only covers `locale`, so every real [id] falls back to
// on-demand rendering; without this the cookies()/DB reads throw
// DYNAMIC_SERVER_USAGE in production. Same note as the sibling detail routes.
export const dynamic = "force-dynamic";

export default async function AdminEmployeeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.employees");

  const context = await getContext();
  const employeeId = Number(id);
  // loadEmployeeProfile runs assertCanViewCompany, which is what enforces
  // region scoping for an admin — Drizzle bypasses RLS.
  const data = Number.isInteger(employeeId) ? await loadEmployeeProfile(context, employeeId).catch(notAuthorizedToNull) : null;

  if (!data) {
    redirect({ href: "/admin/employees", locale });
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Link href="/admin/employees" className="text-sm text-muted-foreground hover:underline">
        {t("backToList")}
      </Link>
      <EmployeeProfile
        employee={data.employee}
        identity={data.identity}
        progress={data.progress}
        certificates={data.certificates}
        cards={data.cards}
        training={data.training}
        history={data.history}
        locale={locale}
        certificateHref={(certificateId) => `/api/certificates/${certificateId}/download`}
      />
    </div>
  );
}
