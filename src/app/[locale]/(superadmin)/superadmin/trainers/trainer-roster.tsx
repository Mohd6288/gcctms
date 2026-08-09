"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { createTrainerLoginAction, updateTrainerAction } from "@/modules/catalog/actions";

interface Trainer {
  id: number;
  fullName: string;
  email: string | null;
  qualifications: string | null;
  active: boolean;
  hasLogin: boolean;
}

export function TrainerRoster({ trainers }: { trainers: Trainer[] }) {
  const t = useTranslations("superadmin.trainers");
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, { fullName: string; qualifications: string; active: boolean }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null);

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

  return (
    <div className="flex flex-col gap-3">
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
