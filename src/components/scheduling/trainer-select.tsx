"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";

// Trainer picker for both class screens (create + detail). Defaults to the
// trainers certified for the selected course, with an explicit opt-in to the
// full roster: GCC Lab runs short of instructors often enough that an admin
// must be able to assign someone uncertified, but it should be a decision
// they take on purpose rather than the default list handing it to them.
// The override is not blocked server-side either — it is written into the
// class's audit note (see scheduling/service.ts).
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface TrainerOption {
  id: number;
  fullName: string;
}

export function TrainerSelect({
  id,
  trainers,
  trainerCourses,
  courseId,
  value,
  onChange,
  showAll,
  onShowAllChange,
  disabled,
}: {
  id: string;
  trainers: TrainerOption[];
  trainerCourses: { trainerId: number; courseId: number }[];
  courseId: number | "";
  value: number | "";
  onChange: (trainerId: number) => void;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.classes.trainerSelect");

  const qualifiedIds = new Set(trainerCourses.filter((tc) => tc.courseId === courseId).map((tc) => tc.trainerId));
  const qualified = trainers.filter((tr) => qualifiedIds.has(tr.id));
  const options = showAll ? trainers : qualified;
  const selectedIsUnqualified = value !== "" && !qualifiedIds.has(Number(value));

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("trainerLabel")}</Label>
      <select id={id} className={selectClassName} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        {/* An empty list would otherwise submit whatever was last selected,
            silently keeping a trainer the admin can no longer see. */}
        {options.length === 0 ? <option value="">{t("trainerNoneQualified")}</option> : null}
        {options.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.fullName}
            {qualifiedIds.has(tr.id) ? "" : ` — ${t("trainerNotCertified")}`}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showAll} disabled={disabled} onChange={(e) => onShowAllChange(e.target.checked)} className="size-3.5" />
        {t("trainerShowAll", { count: trainers.length - qualified.length })}
      </label>

      {qualified.length === 0 && !showAll ? <p className="text-xs text-warning">{t("trainerNoneQualifiedHint")}</p> : null}
      {selectedIsUnqualified ? <p className="text-xs text-warning">{t("trainerOverrideWarning")}</p> : null}
    </div>
  );
}
