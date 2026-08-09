import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listActiveEnrollmentRequestItemIds, listPlatformAdmins, listRegionalAdminAssignments, listSchedulableRequestItems } from "@/modules/scheduling/queries";
import { SchedulingBoard } from "./scheduling-board";
import { REGIONS } from "@/lib/regions";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}


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

  // A region can have several admins since 0030, so collect every name
  // rather than letting Object.fromEntries keep only the last one — that
  // would quietly show one admin and hide the rest.
  const adminNameById = new Map(admins.map((a) => [a.userId, a.fullName]));
  const namesByRegion = new Map<string, string[]>();
  for (const a of assignments) {
    const name = a.adminUserId ? adminNameById.get(a.adminUserId) : null;
    if (!name) continue;
    namesByRegion.set(a.region, [...(namesByRegion.get(a.region) ?? []), name]);
  }
  const adminNameByRegion = Object.fromEntries(
    REGIONS.map((region) => [region, namesByRegion.get(region)?.join(", ") ?? null])
  ) as Record<string, string | null>;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <SchedulingBoard unassigned={unassigned} byRegion={byRegion} adminNameByRegion={adminNameByRegion} locale={locale} />
    </div>
  );
}
