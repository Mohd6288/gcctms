import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext, listPrivilegedAccounts } from "@/modules/platform/auth/service";
import { listRegionalAdminAssignments } from "@/modules/scheduling/queries";
import { CreatePanel } from "@/components/ui/create-panel";
import { CreateAccountForm } from "./create-account-form";
import { RegionSelect } from "./region-select";
import { AccountActions } from "@/components/superadmin/account-actions";
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
      <p className="-mt-4 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      <CreatePanel
        title={t("createTitle")}
        addLabel={t("addAction")}
        cancelLabel={t("cancel")}
        defaultOpen={accounts.length === 0}
      >
        <CreateAccountForm />
      </CreatePanel>

      <div className="flex flex-col gap-6">
        {/* One card per account instead of eight columns that ran off the
            side of the screen — the region dropdown and the recovery buttons
            need room, and they were the two things furthest to the right. */}
        <div className="grid grid-cols-1 content-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {accounts.length === 0 ? (
            <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground 2xl:col-span-2">{t("empty")}</p>
          ) : null}

          {accounts.map((account) => (
            <div key={account.userId} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="font-medium">{account.fullName}</span>
                  {account.email ? <CopyEmail email={account.email} /> : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {roleLabels[account.role] ?? account.role}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      account.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {account.active ? t("statusActive") : t("statusInactive")}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {/* "never signed in" and "signed in but never got past MFA"
                    look identical without this, and they need different help. */}
                {account.lastSignInAt ? (
                  <span>{t("lastSignIn", { date: new Date(account.lastSignInAt).toLocaleDateString(locale) })}</span>
                ) : (
                  <span className="text-warning">{t("neverSignedIn")}</span>
                )}
                <span>{account.mfaFactors > 0 ? t("mfaEnrolled") : t("mfaPending")}</span>
                <span>{t("createdOn", { date: new Date(account.createdAt).toLocaleDateString(locale) })}</span>
              </div>

              {account.role === "platform_admin" ? (
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <span className="text-xs font-medium">{t("tableRegion")}</span>
                  <RegionSelect adminUserId={account.userId} currentRegion={regionByAdminId.get(account.userId) ?? null} />
                </div>
              ) : null}

              <div className="border-t border-border pt-3">
                <AccountActions userId={account.userId} fullName={account.fullName} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
