"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { assignRequestItemRegionAction, autoAssignPooledByPreferenceAction, unassignRequestItemRegionAction } from "@/modules/scheduling/actions";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
type Region = (typeof REGIONS)[number];
const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface PooledItem {
  requestItemId: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  companyName: string;
  preferredRegion: string | null;
}

// The validated prototype's scheduling board uses real drag-and-drop
// (dnd-kit); this port uses a select+button per row instead — same
// underlying action (assign a region), no new client-side DnD dependency
// for what's otherwise a server-action-driven codebase throughout. A
// drag-and-drop upgrade is a reasonable later enhancement, not a
// functional gap — every action here does exactly what a drop would.
export function SchedulingBoard({
  unassigned,
  byRegion,
  adminNameByRegion,
  locale,
}: {
  unassigned: PooledItem[];
  byRegion: Record<Region, PooledItem[]>;
  adminNameByRegion: Record<string, string | null>;
  locale: string;
}) {
  const t = useTranslations("admin.scheduling");
  const router = useRouter();
  const [regionChoice, setRegionChoice] = useState<Record<number, Region>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setLoading(key);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button
          type="button"
          variant="outline"
          disabled={loading === "auto"}
          onClick={() => run("auto", autoAssignPooledByPreferenceAction)}
        >
          {t("autoAssign")}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("poolTitle")} ({unassigned.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("poolEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {unassigned.map((p) => (
                <li key={p.requestItemId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                  <span>
                    {locale === "ar" ? p.employeeFullNameAr : p.employeeFullNameEn} — {p.companyName}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      className={selectClassName}
                      value={regionChoice[p.requestItemId] ?? p.preferredRegion ?? "Central"}
                      onChange={(e) => setRegionChoice((prev) => ({ ...prev, [p.requestItemId]: e.target.value as Region }))}
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={loading === `assign-${p.requestItemId}`}
                      onClick={() =>
                        run(`assign-${p.requestItemId}`, () =>
                          assignRequestItemRegionAction({ requestItemId: p.requestItemId, region: regionChoice[p.requestItemId] ?? (p.preferredRegion as Region) ?? "Central" })
                        )
                      }
                    >
                      {t("assignTo", { region: regionChoice[p.requestItemId] ?? p.preferredRegion ?? "Central" })}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REGIONS.map((region) => (
          <Card key={region}>
            <CardHeader className="flex flex-col gap-2">
              <CardTitle>
                {region} ({byRegion[region]?.length ?? 0})
              </CardTitle>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t("regionalAdminLabel")}</label>
                <p className="text-sm">{adminNameByRegion[region] ?? t("regionalAdminNone")}</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(byRegion[region] ?? []).map((p) => (
                <div key={p.requestItemId} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>
                    {locale === "ar" ? p.employeeFullNameAr : p.employeeFullNameEn} — {p.companyName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loading === `unassign-${p.requestItemId}`}
                    onClick={() => run(`unassign-${p.requestItemId}`, () => unassignRequestItemRegionAction(p.requestItemId))}
                  >
                    {t("unassign")}
                  </Button>
                </div>
              ))}
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/classes/new?region=${region}`}>{t("newClass")}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
