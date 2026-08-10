import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listTrainerCourses, listTrainers, listTrainingCenters } from "@/modules/catalog/queries";
import { listPendingApprovalCertificatesForClass, listIssuedCertificatesForClass } from "@/modules/certification/queries";
import { getClassById, listActiveEnrollmentRequestItemIds, listEnrollmentsForClass, listSchedulableRequestItems, listMoveTargets } from "@/modules/scheduling/queries";
import { ClassDetail } from "./class-detail";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// generateStaticParams only enumerates `locale`, never the real `[id]`
// values (data-dependent, unbounded) — every actual request falls back to
// on-demand rendering. Without an explicit dynamic export, Next treats that
// fallback render as a static-shell candidate, and this page's cookies()/DB
// reads inside it throw DYNAMIC_SERVER_USAGE in production (works locally,
// where dev never prerenders). Confirmed live: this crashed every
// dynamic-segment detail page in the app (companies/[id], requests/[id],
// classes/[id], employees/[id], catalog/[id], verify/[serial]).
export const dynamic = "force-dynamic";

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.classes.detail");

  const context = await getContext();
  const classId = Number(id);
  const cls = Number.isInteger(classId) ? await getClassById(classId) : null;

  // See admin/requests/[id]/page.tsx's identical note — Drizzle bypasses
  // RLS, and this detail route is reachable directly by id regardless of
  // whether it appeared in the (region-scoped) list.
  const regionDenied = context?.region != null && cls?.region !== context.region;

  if (!authorize("schedule_classes", context) || !cls || regionDenied) {
    redirect({ href: "/admin/classes", locale });
    return null;
  }

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // Supabase pooler (see db/index.ts).
  const enrollments = await listEnrollmentsForClass(classId);
  const trainers = await listTrainers();
  const trainerCourses = await listTrainerCourses();
  const centers = await listTrainingCenters();
  const pooled = await listSchedulableRequestItems();
  const activeIds = await listActiveEnrollmentRequestItemIds();
  const pendingCertificates = await listPendingApprovalCertificatesForClass(classId);
  const moveTargets = await listMoveTargets(classId);
  const issuedCertificates = await listIssuedCertificatesForClass(classId);

  // "Available in this region" pool: billable, ready_for_scheduling, this
  // class's region, no active enrollment anywhere yet.
  const availablePool = pooled.filter((p) => !activeIds.has(p.requestItemId) && p.assignedRegion === cls.region);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-3xl">
        <Link href="/admin/classes" className="text-sm text-muted-foreground hover:underline">
          {t("backToList")}
        </Link>
      </div>
      <ClassDetail
        cls={cls}
        enrollments={enrollments}
        trainers={trainers.filter((tr) => tr.active)}
        trainerCourses={trainerCourses}
        centers={centers.filter((c) => c.active)}
        availablePool={availablePool}
        pendingCertificates={pendingCertificates}
        moveTargets={moveTargets}
        issuedCertificates={issuedCertificates.map((c) => ({ ...c, issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null }))}
        locale={locale}
      />
    </div>
  );
}
