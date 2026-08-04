"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import {
  cancelClassAction,
  enrollRequestItemAction,
  removeEnrollmentAction,
  removeFromWaitlistAction,
  startClassAction,
  updateClassAction,
} from "@/modules/scheduling/actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface ClassData {
  id: number;
  courseCode: string;
  courseTitleEn: string;
  courseTitleAr: string;
  trainerId: number;
  centerId: number | null;
  region: string;
  type: string;
  companyId: number | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: string;
}
interface Enrollment {
  id: number;
  requestItemId: number;
  employeeId: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  companyName: string;
  status: string;
}
interface TrainerOption {
  id: number;
  fullName: string;
}
interface CenterOption {
  id: number;
  name: string;
}
interface PooledItem {
  requestItemId: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  companyName: string;
}

export function ClassDetail({
  cls,
  enrollments,
  trainers,
  centers,
  availablePool,
  locale,
}: {
  cls: ClassData;
  enrollments: Enrollment[];
  trainers: TrainerOption[];
  centers: CenterOption[];
  availablePool: PooledItem[];
  locale: string;
}) {
  const t = useTranslations("admin.classes.detail");
  const router = useRouter();

  const [trainerId, setTrainerId] = useState(cls.trainerId);
  const [centerId, setCenterId] = useState<number | "">(cls.centerId ?? "");
  const [startDate, setStartDate] = useState(cls.startDate);
  const [endDate, setEndDate] = useState(cls.endDate);
  const [capacity, setCapacity] = useState(String(cls.capacity));
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const isLocked = cls.status === "cancelled" || cls.status === "completed";
  const enrolled = enrollments.filter((e) => e.status === "enrolled");
  const waitlisted = enrollments.filter((e) => e.status === "waitlisted");

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setLoading(key);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {cls.courseCode} — {locale === "ar" ? cls.courseTitleAr : cls.courseTitleEn}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cls.status === "cancelled" ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("cancelledBanner")}</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("regionLabel")}</Label>
              <Input value={cls.region} disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("typeLabel")}</Label>
              <Input value={cls.type} disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trainerId">{t("trainerLabel")}</Label>
              <select
                id="trainerId"
                className={selectClassName}
                value={trainerId}
                disabled={isLocked}
                onChange={(e) => setTrainerId(Number(e.target.value))}
              >
                {trainers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="centerId">{t("centerLabel")}</Label>
              <select
                id="centerId"
                className={selectClassName}
                value={centerId}
                disabled={isLocked}
                onChange={(e) => setCenterId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">{t("centerNone")}</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">{t("startDateLabel")}</Label>
              <Input id="startDate" type="date" value={startDate} disabled={isLocked} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">{t("endDateLabel")}</Label>
              <Input id="endDate" type="date" value={endDate} disabled={isLocked} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="capacity">{t("capacityLabel")}</Label>
              <Input id="capacity" type="number" min={enrolled.length} value={capacity} disabled={isLocked} onChange={(e) => setCapacity(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("capacityHint", { count: enrolled.length })}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("statusLabel")}</Label>
              <Input value={cls.status} disabled />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            {!isLocked ? (
              <Button
                type="button"
                disabled={loading === "save"}
                onClick={() =>
                  run("save", () =>
                    updateClassAction({
                      classId: cls.id,
                      trainerId,
                      centerId: centerId ? Number(centerId) : undefined,
                      startDate,
                      endDate,
                      capacity: Number(capacity),
                    })
                  )
                }
              >
                {loading === "save" ? t("saving") : t("save")}
              </Button>
            ) : null}
            {cls.status === "scheduled" ? (
              <Button type="button" variant="outline" disabled={loading === "start"} onClick={() => run("start", () => startClassAction(cls.id))}>
                {t("startClass")}
              </Button>
            ) : null}
            {!isLocked ? (
              <Button type="button" variant="outline" onClick={() => setShowCancelForm((s) => !s)}>
                {t("cancelClass")}
              </Button>
            ) : null}
          </div>

          {showCancelForm ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Label htmlFor="cancelReason">{t("cancelReasonLabel")}</Label>
              <Input id="cancelReason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!cancelReason || loading === "cancel"}
                  onClick={() => run("cancel", () => cancelClassAction({ classId: cls.id, reason: cancelReason }))}
                >
                  {t("cancelConfirm")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowCancelForm(false)}>
                  {t("cancelDismiss")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rosterTitle", { count: enrolled.length, capacity: cls.capacity })}</CardTitle>
        </CardHeader>
        <CardContent>
          {enrolled.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rosterEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {enrolled.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>
                    {locale === "ar" ? e.employeeFullNameAr : e.employeeFullNameEn} — {e.companyName}
                  </span>
                  {!isLocked ? (
                    <Button type="button" size="sm" variant="ghost" disabled={loading === `remove-${e.id}`} onClick={() => run(`remove-${e.id}`, () => removeEnrollmentAction(e.id))}>
                      {t("remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {waitlisted.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("waitlistTitle", { count: waitlisted.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {waitlisted.map((e, i) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>
                    #{i + 1} {locale === "ar" ? e.employeeFullNameAr : e.employeeFullNameEn} — {e.companyName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loading === `waitlist-${e.id}`}
                    onClick={() => run(`waitlist-${e.id}`, () => removeFromWaitlistAction(e.id))}
                  >
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!isLocked && availablePool.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("availableTitle", { region: cls.region })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {availablePool.map((p) => (
                <li key={p.requestItemId} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>
                    {locale === "ar" ? p.employeeFullNameAr : p.employeeFullNameEn} — {p.companyName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading === `enroll-${p.requestItemId}`}
                    onClick={() => run(`enroll-${p.requestItemId}`, () => enrollRequestItemAction({ requestItemId: p.requestItemId, classId: cls.id }))}
                  >
                    {t("enroll")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
