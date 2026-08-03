"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { updateTrainerAction } from "@/modules/catalog/actions";

interface Trainer {
  id: number;
  fullName: string;
  qualifications: string | null;
  active: boolean;
}

export function TrainerRoster({ trainers }: { trainers: Trainer[] }) {
  const t = useTranslations("superadmin.trainers");
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, { fullName: string; qualifications: string; active: boolean }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

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

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="p-3 text-start font-medium">{t("tableName")}</th>
            <th className="p-3 text-start font-medium">{t("tableQualifications")}</th>
            <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
            <th className="p-3 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {trainers.length === 0 ? (
            <tr>
              <td className="p-3 text-muted-foreground" colSpan={4}>
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
  );
}
