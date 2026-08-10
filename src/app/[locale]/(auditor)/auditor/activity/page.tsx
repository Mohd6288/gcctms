import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listActivityFilterOptions, listAuditActivity } from "@/modules/audit/queries";
import { listStaffAccounts } from "@/modules/directory/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// The trail an audit actually turns on. It used to render the last 500 rows
// with no way to narrow them — which is a sample, not an investigation, and
// on a platform of several thousand users the interesting entry is almost
// never in the last 500.
//
// Every filter lives in the URL, so a filtered view is a link: "here is
// exactly what I was looking at" is the most useful thing one investigator
// can send another.
export default async function AuditorActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ actor?: string; entity?: string; action?: string; from?: string; to?: string; q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.activity");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const filters = {
    actorUserId: sp.actor || null,
    entityType: sp.entity || null,
    action: sp.action || null,
    from: sp.from || null,
    to: sp.to || null,
    q: sp.q || null,
    page: Math.max(1, Number(sp.page) || 1),
  };

  // Sequential, never Promise.all — see db/index.ts.
  const activity = await listAuditActivity(filters);
  const options = await listActivityFilterOptions();
  const accounts = await listStaffAccounts();

  const from = activity.total === 0 ? 0 : (activity.page - 1) * activity.pageSize + 1;
  const to = Math.min(activity.page * activity.pageSize, activity.total);
  const lastPage = Math.max(1, Math.ceil(activity.total / activity.pageSize));

  const query = (overrides: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.actor) p.set("actor", sp.actor);
    if (sp.entity) p.set("entity", sp.entity);
    if (sp.action) p.set("action", sp.action);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.q) p.set("q", sp.q);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return p.toString();
  };
  const hasFilters = Boolean(sp.actor || sp.entity || sp.action || sp.from || sp.to || sp.q);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* A plain GET form: the filters end up in the URL, the page needs no
          client JS, and the result is shareable. */}
      <form method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="actor" className="text-xs font-medium">
            {t("filterActor")}
          </label>
          <select id="actor" name="actor" className={selectClassName} defaultValue={sp.actor ?? ""}>
            <option value="">{t("filterAny")}</option>
            {accounts.map((account) => (
              <option key={account.userId} value={account.userId}>
                {account.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="entity" className="text-xs font-medium">
            {t("filterEntity")}
          </label>
          <select id="entity" name="entity" className={selectClassName} defaultValue={sp.entity ?? ""}>
            <option value="">{t("filterAny")}</option>
            {options.entityTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="action" className="text-xs font-medium">
            {t("filterAction")}
          </label>
          <select id="action" name="action" className={selectClassName} defaultValue={sp.action ?? ""}>
            <option value="">{t("filterAny")}</option>
            {options.actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-xs font-medium">
            {t("filterFrom")}
          </label>
          <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-xs font-medium">
            {t("filterTo")}
          </label>
          <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-medium">
            {t("filterText")}
          </label>
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder={t("filterTextPlaceholder")} />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-6">
          <Button type="submit" size="sm">
            {t("applyFilters")}
          </Button>
          {hasFilters ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/auditor/activity">{t("clearFilters")}</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            {/* Exports the filtered set, not the page on screen. */}
            <a href={`/api/auditor/export/activity${query({}) ? `?${query({})}` : ""}`}>{t("exportMatching")}</a>
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("colWhen")}</th>
              <th className="p-3 text-start font-medium">{t("colActor")}</th>
              <th className="p-3 text-start font-medium">{t("colEntity")}</th>
              <th className="p-3 text-start font-medium">{t("colAction")}</th>
              <th className="p-3 text-start font-medium">{t("colTransition")}</th>
              <th className="p-3 text-start font-medium">{t("colNote")}</th>
            </tr>
          </thead>
          <tbody>
            {activity.rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  {t("noMatches")}
                </td>
              </tr>
            ) : (
              activity.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="p-3">
                    {row.actor ?? t("systemActor")}
                    {row.actorRole ? <span className="ms-1 text-xs text-muted-foreground">({row.actorRole})</span> : null}
                  </td>
                  <td className="p-3 text-xs">
                    {row.entityType} #{row.entityId}
                  </td>
                  <td className="p-3">{row.action}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {row.fromStatus || row.toStatus ? `${row.fromStatus ?? "—"} → ${row.toStatus ?? "—"}` : "—"}
                  </td>
                  <td className="p-3 max-w-md text-xs text-muted-foreground">{row.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("showingRange", { from, to, total: activity.total })}</p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" disabled={activity.page <= 1}>
            <Link href={`/auditor/activity?${query({ page: String(Math.max(1, activity.page - 1)) })}`}>{t("prevPage")}</Link>
          </Button>
          <span className="text-xs text-muted-foreground">{t("pageOf", { page: activity.page, last: lastPage })}</span>
          <Button asChild size="sm" variant="outline" disabled={activity.page >= lastPage}>
            <Link href={`/auditor/activity?${query({ page: String(Math.min(lastPage, activity.page + 1)) })}`}>{t("nextPage")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
