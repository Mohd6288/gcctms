"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { AccountActions } from "@/components/superadmin/account-actions";
import { CoursePicker, type PickableCourse } from "@/components/superadmin/course-picker";
import { createAllTrainerLoginsAction, createTrainerLoginAction, updateTrainerAction } from "@/modules/catalog/actions";

// One card per trainer instead of a row of eight input boxes. Everything a
// super admin needs about a person — contact, competencies, account state,
// recovery — is on the card, and editing is an explicit mode rather than a
// grid of always-live fields where a stray keystroke edits the roster.
interface Trainer {
  id: number;
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  active: boolean;
  hasLogin: boolean;
  courseCount: number;
  lastSignInAt: string | Date | null;
}

interface Fields {
  fullName: string;
  qualifications: string;
  active: boolean;
  courseIds: number[];
}

export function TrainerRoster({
  trainers,
  courses,
  trainerCourses,
  locale,
}: {
  trainers: Trainer[];
  courses: PickableCourse[];
  trainerCourses: { trainerId: number; courseId: number }[];
  locale: string;
}) {
  const t = useTranslations("superadmin.trainers");
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null);
  const [batch, setBatch] = useState<{ created: { fullName: string; email: string; tempPassword: string }[]; failed: { fullName: string; reason: string }[] } | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);

  const coursesById = new Map(courses.map((c) => [c.id, c]));
  function courseIdsFor(trainerId: number) {
    return trainerCourses.filter((tc) => tc.trainerId === trainerId).map((tc) => tc.courseId);
  }

  function startEdit(trainer: Trainer) {
    setError(null);
    setEditingId(trainer.id);
    setFields({
      fullName: trainer.fullName,
      qualifications: trainer.qualifications ?? "",
      active: trainer.active,
      courseIds: courseIdsFor(trainer.id),
    });
  }

  async function handleSave(trainer: Trainer) {
    if (!fields) return;
    setSavingId(trainer.id);
    setError(null);
    try {
      await updateTrainerAction({
        trainerId: trainer.id,
        fullName: fields.fullName,
        qualifications: fields.qualifications || undefined,
        active: fields.active,
        courseIds: fields.courseIds,
      });
      setEditingId(null);
      setFields(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSavingId(null);
    }
  }

  // Links an account to THIS roster row rather than creating a second
  // trainer — the roster carries the course competencies, so a duplicate
  // would end up holding the login while the original holds them.
  async function handleCreateLogin(trainer: Trainer) {
    setError(null);
    setCreatingId(trainer.id);
    try {
      setCredentials(await createTrainerLoginAction({ trainerId: trainer.id }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setCreatingId(null);
    }
  }

  async function handleCreateAll() {
    setError(null);
    setCredentials(null);
    setCreatingAll(true);
    try {
      setBatch(await createAllTrainerLoginsAction());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setCreatingAll(false);
    }
  }

  const withoutLogin = trainers.filter((tr) => !tr.hasLogin && tr.email);

  return (
    <div className="flex flex-col gap-3">
      {withoutLogin.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
          <span className="text-sm">{t("bulkPrompt", { count: withoutLogin.length })}</span>
          <Button type="button" size="sm" disabled={creatingAll} onClick={handleCreateAll}>
            {creatingAll ? t("bulkCreating") : t("bulkCreate", { count: withoutLogin.length })}
          </Button>
        </div>
      ) : null}

      {/* Every temporary password at once — they are shown exactly once, so
          this table is the only chance to copy them before handing them out. */}
      {batch ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium">{t("bulkCreated", { count: batch.created.length })}</p>
          {batch.created.length > 0 ? (
            <>
              <p className="text-muted-foreground">{t("loginTempPassword")}</p>
              <table className="w-full text-xs">
                <tbody>
                  {batch.created.map((c) => (
                    <tr key={c.email} className="border-b border-border/60 last:border-0">
                      <td className="py-1 pe-3">{c.fullName}</td>
                      <td className="py-1 pe-3 text-muted-foreground">{c.email}</td>
                      <td className="py-1 font-mono">{c.tempPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {batch.failed.length > 0 ? (
            <ul className="list-inside list-disc text-xs text-destructive">
              {batch.failed.map((f) => (
                <li key={f.fullName}>
                  {f.fullName}: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {credentials ? (
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium">{t("loginCreated", { email: credentials.email })}</p>
          <p className="mt-1 text-muted-foreground">{t("loginTempPassword")}</p>
          <p className="mt-1 font-mono">{credentials.tempPassword}</p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {trainers.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}

      {trainers.map((trainer) => {
        const editing = editingId === trainer.id && fields !== null;
        const taught = courseIdsFor(trainer.id);
        return (
          <div key={trainer.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{trainer.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {trainer.email ?? t("noEmail")}
                  {trainer.phone ? ` · ${trainer.phone}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {trainer.lastSignInAt
                    ? t("lastSignIn", { date: new Date(trainer.lastSignInAt).toLocaleDateString(locale) })
                    : t("neverSignedIn")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    trainer.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {trainer.active ? t("statusActive") : t("statusInactive")}
                </span>
                {trainer.hasLogin ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">{t("loginActive")}</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={creatingId === trainer.id || !trainer.email}
                    title={trainer.email ?? t("loginNeedsEmail")}
                    onClick={() => handleCreateLogin(trainer)}
                  >
                    {creatingId === trainer.id ? t("loginCreating") : t("createLogin")}
                  </Button>
                )}
              </div>
            </div>

            {editing ? (
              <div className="flex flex-col gap-4 border-t border-border pt-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`name-${trainer.id}`}>{t("fullNameLabel")}</Label>
                    <Input
                      id={`name-${trainer.id}`}
                      value={fields.fullName}
                      onChange={(e) => setFields({ ...fields, fullName: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`quals-${trainer.id}`}>{t("qualificationsLabel")}</Label>
                    <Input
                      id={`quals-${trainer.id}`}
                      value={fields.qualifications}
                      onChange={(e) => setFields({ ...fields, qualifications: e.target.value })}
                      placeholder={t("qualificationsPlaceholder")}
                    />
                  </div>
                </div>

                <CoursePicker
                  courses={courses}
                  selected={fields.courseIds}
                  onChange={(courseIds) => setFields({ ...fields, courseIds })}
                  locale={locale}
                />

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={fields.active}
                    onChange={(e) => setFields({ ...fields, active: e.target.checked })}
                  />
                  {t("activeLabel")}
                </label>

                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={savingId === trainer.id} onClick={() => handleSave(trainer)}>
                    {savingId === trainer.id ? t("saving") : t("save")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={savingId === trainer.id}
                    onClick={() => {
                      setEditingId(null);
                      setFields(null);
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-medium">{t("coursesLabel")}</span>
                  {taught.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("noCourses")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {taught.map((courseId) => {
                        const course = coursesById.get(courseId);
                        return (
                          <span
                            key={courseId}
                            className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                            title={course ? (locale === "ar" ? course.titleAr : course.titleEn) : undefined}
                          >
                            {course?.code ?? courseId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{t("qualificationsLabel")}:</span> {trainer.qualifications ?? "—"}
                </p>
                <div className="flex flex-wrap items-start gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(trainer)}>
                    {t("edit")}
                  </Button>
                  {/* A trainer signs in rarely and enrols MFA on a phone, so
                      they are the likeliest account to need recovery. */}
                  {trainer.userId ? <AccountActions userId={trainer.userId} fullName={trainer.fullName} /> : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
