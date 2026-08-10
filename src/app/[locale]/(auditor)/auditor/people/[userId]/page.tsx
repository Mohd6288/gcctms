import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getAccountProfile, listAccountActivity } from "@/modules/directory/queries";
import { ProfileHeader, ProgressCard } from "@/components/profile/profile-header";
import { Timeline } from "@/components/profile/timeline";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

// A staff account's profile. The "progress" of someone who holds no
// certificates is what they have done with the platform — which is precisely
// the question an audit asks about an admin.
export default async function AuditorAccountProfilePage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.directory");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const account = await getAccountProfile(userId);
  if (!account) {
    redirect({ href: "/auditor/directory", locale });
    return null;
  }
  const activity = await listAccountActivity(userId);

  const roleLabels: Record<string, string> = {
    super_admin: t("roleSuperAdmin"),
    platform_admin: t("rolePlatformAdmin"),
    contractor_manager: t("roleContractorManager"),
    trainer: t("roleTrainer"),
    auditor: t("roleAuditor"),
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Link href="/auditor/directory" className="text-sm text-muted-foreground hover:underline">
        {t("backToDirectory")}
      </Link>

      <ProfileHeader
        name={account.fullName}
        subtitle={roleLabels[account.role] ?? account.role}
        chips={[
          { label: account.active ? t("accountActive") : t("accountInactive"), tone: account.active ? "success" : "muted" },
          // Never signing in and signing in without MFA are different
          // problems, and an audit cares about both.
          account.mfaFactors > 0
            ? { label: t("mfaEnrolled"), tone: "success" as const }
            : { label: t("mfaPending"), tone: "warning" as const },
        ]}
        facts={[
          { label: t("colEmail"), value: account.email },
          { label: t("colRegion"), value: account.region ?? t("regionUnscoped") },
          {
            label: t("colLastSignIn"),
            value: account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleString(locale) : t("neverSignedIn"),
          },
          { label: t("colCreated"), value: new Date(account.createdAt).toLocaleDateString(locale) },
        ]}
      />

      <ProgressCard
        title={t("accountActivityTitle")}
        stats={[
          { label: t("statActions"), value: account.actionsTaken },
          { label: t("statShown"), value: activity.length },
        ]}
      />

      {/* The actor view of audit_log: what this person did, rather than what
          was done to a record. */}
      <Timeline
        entries={activity.map((row) => ({ ...row, actor: `${row.entityType} #${row.entityId}`, actorRole: null }))}
        locale={locale}
        title={t("accountHistoryTitle")}
      />
    </div>
  );
}
