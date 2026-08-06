import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listClasses } from "@/modules/scheduling/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const REGION_CLASS: Record<string, string> = {
  North: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  South: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  East: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  West: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Central: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

// Every non-cancelled class in the visible month, grouped into a plain
// 7-column week grid. No conflict-detection UI here — unlike the validated
// prototype, trainer double-booking is a database-level GIST exclusion
// constraint (see 0011_scheduling.sql), so an overlapping booking for the
// same trainer can't exist to warn about in the first place.
export default async function AdminCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  const { month } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("admin.calendar");

  const context = await getContext();
  const classes = authorize("schedule_classes", context) ? await listClasses(context?.region) : [];

  const now = new Date();
  const [viewYear, viewMonth] = month && /^\d{4}-\d{2}$/.test(month) ? month.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))) : [now.getFullYear(), now.getMonth()];

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();

  const cells: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ iso: "", day: daysInPrevMonth - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: toIso(viewYear, viewMonth, d), day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ iso: "", day: cells.length - startWeekday - daysInMonth + 1, inMonth: false });
  }

  const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate());
  const monthLabel = firstOfMonth.toLocaleDateString(locale === "ar" ? "ar" : "en", { year: "numeric", month: "long", timeZone: "UTC" });

  const prevMonth = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
  const nextMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 1));
  const prevHref = `/admin/calendar?month=${prevMonth.getUTCFullYear()}-${pad(prevMonth.getUTCMonth() + 1)}`;
  const nextHref = `/admin/calendar?month=${nextMonth.getUTCFullYear()}-${pad(nextMonth.getUTCMonth() + 1)}`;
  const todayHref = `/admin/calendar?month=${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  const activeClasses = classes.filter((c) => c.status !== "cancelled");

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {t("title")} — {monthLabel}
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={prevHref} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
            {t("previous")}
          </Link>
          <Link href={todayHref} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
            {t("today")}
          </Link>
          <Link href={nextHref} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
            {t("next")}
          </Link>
        </div>
      </div>

      {activeClasses.length === 0 ? <p className="text-sm text-muted-foreground">{t("noClasses")}</p> : null}

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10">
        {cells.map((cell, i) => {
          const dayClasses = cell.inMonth ? activeClasses.filter((c) => cell.iso >= c.startDate && cell.iso <= c.endDate) : [];
          const isToday = cell.iso === todayIso;
          return (
            <div key={i} className={`min-h-24 bg-card p-1.5 ${cell.inMonth ? "" : "opacity-40"} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
              <p className="text-xs text-muted-foreground">{cell.day}</p>
              <div className="mt-1 flex flex-col gap-1">
                {dayClasses.map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/classes/${c.id}`}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] ${REGION_CLASS[c.region] ?? "bg-muted text-muted-foreground"}`}
                    title={`${c.courseCode} — ${c.trainerFullName}`}
                  >
                    {c.courseCode} · {c.trainerFullName}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
