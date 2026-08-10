import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listClassEnrollmentsForCompany } from "@/modules/scheduling/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Row = Awaited<ReturnType<typeof listClassEnrollmentsForCompany>>[number];

interface ClassGroup {
  classId: number;
  courseCode: string;
  courseTitleEn: string;
  courseTitleAr: string | null;
  trainerFullName: string;
  centerName: string | null;
  region: string;
  locationUrl: string | null;
  locationNote: string | null;
  startDate: string;
  endDate: string;
  classStatus: string;
  rows: Row[];
}

// One row per employee comes back from the query; the page shows one card
// per class with that company's roster inside it.
function groupByClass(rows: Row[]): ClassGroup[] {
  const groups = new Map<number, ClassGroup>();
  for (const row of rows) {
    let group = groups.get(row.classId);
    if (!group) {
      group = { ...row, rows: [] };
      groups.set(row.classId, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

interface Labels {
  dates: string;
  location: string;
  openLocation: string;
  noLocation: string;
  trainer: string;
  employees: (count: number) => string;
  waitlisted: (count: number) => string;
  attendance: (pct: string) => string;
  classStatus: Record<string, string>;
}

function ClassCard({ group, locale, labels }: { group: ClassGroup; locale: string; labels: Labels }) {
  const enrolled = group.rows.filter((r) => r.enrollmentStatus !== "waitlisted");
  const waitlisted = group.rows.filter((r) => r.enrollmentStatus === "waitlisted");
  const name = (r: Row) => (locale === "ar" ? r.employeeFullNameAr : r.employeeFullNameEn) ?? r.employeeFullNameEn;

  return (
    <div className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">
          {group.courseCode} · {locale === "ar" ? (group.courseTitleAr ?? group.courseTitleEn) : group.courseTitleEn}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {labels.classStatus[group.classStatus] ?? group.classStatus}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt>{labels.dates}</dt>
          <dd className="text-foreground">
            {group.startDate} – {group.endDate}
          </dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt>{labels.location}</dt>
          {/* Centre is optional on a class; fall back to the region rather than an empty row. */}
          <dd className="text-foreground">{group.centerName ?? group.region}</dd>
          {/* The pin the admin coordinated for this class — the thing a
              candidate actually needs on the morning. */}
          {group.locationUrl ? (
            <dd>
              <a href={group.locationUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                {labels.openLocation}
              </a>
            </dd>
          ) : (
            <dd className="text-muted-foreground">{labels.noLocation}</dd>
          )}
          {group.locationNote ? <dd className="w-full text-xs text-muted-foreground">{group.locationNote}</dd> : null}
        </div>
        <div className="flex gap-2">
          <dt>{labels.trainer}</dt>
          <dd className="text-foreground">{group.trainerFullName}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{labels.employees(enrolled.length)}</span>
        <ul className="flex flex-col gap-0.5">
          {enrolled.map((r) => (
            <li key={r.employeeId} className="flex items-baseline justify-between gap-2">
              <span>{name(r)}</span>
              {r.attendancePct != null ? (
                <span className="text-xs text-muted-foreground">{labels.attendance(r.attendancePct)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {waitlisted.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{labels.waitlisted(waitlisted.length)}</span>
          <ul className="flex flex-col gap-0.5">
            {waitlisted.map((r) => (
              <li key={r.employeeId}>{name(r)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  items,
  locale,
  labels,
}: {
  title: string;
  items: ClassGroup[];
  locale: string;
  labels: Labels;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((group) => (
          <ClassCard key={group.classId} group={group} locale={locale} labels={labels} />
        ))}
      </div>
    </section>
  );
}

export default async function ContractorTrainingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.training");

  const context = await getContext();
  if (!context?.companyId) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const groups = groupByClass(await listClassEnrollmentsForCompany(context.companyId));
  // in_progress counts as upcoming, not completed — the class is still
  // running, so the roster is still live for the contractor.
  const upcoming = groups.filter((g) => g.classStatus === "scheduled" || g.classStatus === "in_progress");
  const completed = groups.filter((g) => g.classStatus === "completed");

  const labels: Labels = {
    dates: t("dates"),
    location: t("location"),
    openLocation: t("openLocation"),
    noLocation: t("noLocation"),
    trainer: t("trainer"),
    employees: (count) => t("employees", { count }),
    waitlisted: (count) => t("waitlisted", { count }),
    attendance: (pct) => t("attendance", { pct }),
    classStatus: {
      scheduled: t("statusScheduled"),
      in_progress: t("statusInProgress"),
      completed: t("statusCompleted"),
    },
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          <Section title={t("sectionUpcoming")} items={upcoming} locale={locale} labels={labels} />
          <Section title={t("sectionCompleted")} items={completed} locale={locale} labels={labels} />
        </div>
      )}
    </div>
  );
}
