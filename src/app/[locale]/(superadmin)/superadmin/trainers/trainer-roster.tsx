"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { createAllTrainerLoginsAction, createTrainerLoginAction, updateTrainerAction } from "@/modules/catalog/actions";

interface Trainer {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  active: boolean;
  hasLogin: boolean;
  courseCount: number;
  lastSignInAt: string | Date | null;
}

export function TrainerRoster({ trainers, locale }: { trainers: Trainer[]; locale: string }) {
  const t = useTranslations("superadmin.trainers");
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, { fullName: string; qualifications: string; active: boolean }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null);
  const [batch, setBatch] = useState<{ created: { fullName: string; email: string; tempPassword: string }[]; failed: { fullName: string; reason: string }[] } | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);

  function fieldsFor(trainer: Trainer) {
    return (
      edits[trainer.id] ?? {
        fullName: trainer.fullName,
        qualifications: trainer.qualifications ?? "",
        active: trainer.active,
      }
    );
  }

  function updateField(trainer: Trainer, patch: Partial<{ fullName: string; qualifications: string; active: boolean }>) {
    setEdits((prev) => ({ ...prev, [trainer.id]: { ...fieldsFor(trainer), ...patch } }));
  }

  async function handleSave(trainer: Trainer) {
    const fields = fieldsFor(trainer);
    setSavingId(trainer.id);
    try {
      await updateTrainerAction({
        trainerId: trainer.id,
        fullName: fields.fullName,
        qualifications: fields.qualifications || undefined,
        active: fields.active,
      });
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  // Links an account to THIS roster row rather than creating a second
  // trainer — the seeded roster carries the course competencies, so a
  // duplicate would end up holding the login while the original holds the
  // qualifications.
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
          this table is the only chance to copy them before handing them
          out. */}
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
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="p-3 text-start font-medium">{t("tableName")}</th>
            <th className="p-3 text-start font-medium">{t("tableContact")}</th>
            <th className="p-3 text-start font-medium">{t("tableCourses")}</th>
            <th className="p-3 text-start font-medium">{t("tableQualifications")}</th>
            <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
            <th className="p-3 text-start font-medium">{t("tableLogin")}</th>
            <th className="p-3 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {trainers.length === 0 ? (
            <tr>
              <td className="p-3 text-muted-foreground" colSpan={5}>
                {t("empty")}
              </td>
            </tr>
          ) : (
            trainers.map((trainer) => {
              const fields = fieldsFor(trainer);
              return (
                <tr key={trainer.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Input value={fields.fullName} onChange={(e) => updateField(trainer, { fullName: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="max-w-[16rem] truncate">{trainer.email ?? "—"}</span>
                      <span className="text-muted-foreground">{trainer.phone ?? "—"}</span>
                      <span className="text-muted-foreground">
                        {trainer.lastSignInAt
                          ? t("lastSignIn", { date: new Date(trainer.lastSignInAt).toLocaleDateString(locale) })
                          : t("neverSignedIn")}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    {/* The competency count was invisible on this screen even
                        though it decides which classes they can take. */}
                    <span className="text-xs">{t("courseCount", { count: trainer.courseCount })}</span>
                  </td>
                  <td className="p-3">
                    <Input value={fields.qualifications} onChange={(e) => updateField(trainer, { qualifications: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={fields.active} onChange={(e) => updateField(trainer, { active: e.target.checked })} />
                      {fields.active ? t("statusActive") : t("statusInactive")}
                    </label>
                  </td>
                  <td className="p-3">
                    {trainer.hasLogin ? (
                      <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                        {t("loginActive")}
                      </span>
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
                  </td>
                  <td className="p-3">
                    <Button type="button" size="sm" variant="outline" disabled={savingId === trainer.id} onClick={() => handleSave(trainer)}>
                      {t("submit")}
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
