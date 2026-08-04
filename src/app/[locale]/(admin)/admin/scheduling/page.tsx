import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listActiveEnrollmentRequestItemIds, listPlatformAdmins, listRegionalAdminAssignments, listSchedulableRequestItems } from "@/modules/scheduling/queries";
import { SchedulingBoard } from "./scheduling-board";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const REGIONS = ["North", "South", "East", "West", "Central"] as const;

export default async function AdminSchedulingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await getTranslations("admin.scheduling");

  const context = await getContext();
  if (!authorize("schedule_classes", context)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Not authorized.</div>
    );
  }

  const [pooled, activeIds, assignments, admins] = await Promise.all([
    listSchedulableRequestItems(),
    listActiveEnrollmentRequestItemIds(),
    listRegionalAdminAssignments(),
    listPlatformAdmins(),
  ]);

  const unassigned = pooled.filter((p) => !activeIds.has(p.requestItemId) && !p.assignedRegion);
  const byRegion = Object.fromEntries(
    REGIONS.map((region) => [region, pooled.filter((p) => !activeIds.has(p.requestItemId) && p.assignedRegion === region)])
  ) as Record<(typeof REGIONS)[number], typeof pooled>;

  const adminByRegion = Object.fromEntries(assignments.map((a) => [a.region, a.adminUserId])) as Record<string, string | null>;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <SchedulingBoard unassigned={unassigned} byRegion={byRegion} adminByRegion={adminByRegion} admins={admins} locale={locale} />
    </div>
  );
}
