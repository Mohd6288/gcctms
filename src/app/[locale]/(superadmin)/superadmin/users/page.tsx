import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext, listPrivilegedAccounts } from "@/modules/platform/auth/service";
import { listRegionalAdminAssignments } from "@/modules/scheduling/queries";
import { CreateAccountForm } from "./create-account-form";
import { RegionSelect } from "./region-select";
import { AccountActions } from "./account-actions";
import { CopyEmail } from "./copy-email";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SuperAdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.users");

  // Defense in depth — the (superadmin)/superadmin layout already gates on
  // role, but every data-touching handler checks authorize() itself too
  // (Golden Rule 2).
  const context = await getContext();
  const canManageUsers = authorize("manage_users", context);
  const [accounts, assignments] = canManageUsers
    ? await Promise.all([listPrivilegedAccounts(), listRegionalAdminAssignments()])
    : [[], []];
  const regionByAdminId = new Map(assignments.filter((a) => a.adminUserId).map((a) => [a.adminUserId as string, a.region]));

  const roleLabels: Record<string, string> = {
    super_admin: t("roleSuperAdmin"),
    platform_admin: t("rolePlatformAdmin"),
    trainer: t("roleTrainer"),
    auditor: t("roleAuditor"),
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CreateAccountForm />
        <div className="flex-1 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("tableName")}</th>
                <th className="p-3 text-start font-medium">{t("tableEmail")}</th>
                <th className="p-3 text-start font-medium">{t("tableRole")}</th>
                <th className="p-3 text-start font-medium">{t("tableRegion")}</th>
                <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
                <th className="p-3 text-start font-medium">{t("tableSignIn")}</th>
                <th className="p-3 text-start font-medium">{t("tableCreated")}</th>
                <th className="p-3 text-start font-medium">{t("tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={8}>
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.userId} className="border-b border-border last:border-0">
                    <td className="p-3">{account.fullName}</td>
                    <td className="p-3">
                      {account.email ? <CopyEmail email={account.email} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3">{roleLabels[account.role] ?? account.role}</td>
                    <td className="p-3">
                      {account.role === "platform_admin" ? (
                        <RegionSelect adminUserId={account.userId} currentRegion={regionByAdminId.get(account.userId) ?? null} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">{account.active ? t("statusActive") : t("statusInactive")}</td>
                    <td className="p-3">
                      {/* "never signed in" and "signed in but never got past
                          MFA" look identical without this, and they need
                          different help. */}
                      {account.lastSignInAt ? (
                        <span>{new Date(account.lastSignInAt).toLocaleDateString(locale)}</span>
                      ) : (
                        <span className="text-warning">{t("neverSignedIn")}</span>
                      )}
                      <span className="ms-2 text-xs text-muted-foreground">
                        {account.mfaFactors > 0 ? t("mfaEnrolled") : t("mfaPending")}
                      </span>
                    </td>
                    <td className="p-3">{new Date(account.createdAt).toLocaleDateString(locale)}</td>
                    <td className="p-3">
                      <AccountActions userId={account.userId} fullName={account.fullName} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
