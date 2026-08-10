import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { loadEmployeeProfile, notAuthorizedToNull } from "@/modules/directory/employee-profile-data";
import { EmployeeProfile } from "@/components/profile/employee-profile";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function AuditorEmployeeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.directory");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const employeeId = Number(id);
  const data = Number.isInteger(employeeId) ? await loadEmployeeProfile(context, employeeId).catch(notAuthorizedToNull) : null;
  if (!data) {
    redirect({ href: "/auditor/directory", locale });
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Link href="/auditor/directory" className="text-sm text-muted-foreground hover:underline">
        {t("backToDirectory")}
      </Link>
      {/* An auditor may open an issued certificate — it is the artefact under
          audit and is already public behind its QR verify page. Identity
          scans and other uploads stay closed to this role
          (platform/storage/service.ts's assertCanTouchCompany). */}
      <EmployeeProfile
        employee={data.employee}
        identity={data.identity}
        progress={data.progress}
        certificates={data.certificates}
        training={data.training}
        history={data.history}
        locale={locale}
        certificateHref={(certificateId) => `/api/certificates/${certificateId}/download`}
      />
    </div>
  );
}
