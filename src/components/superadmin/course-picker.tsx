"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

// Which courses a trainer is certified to deliver, picked from the catalog
// instead of typed. The scheduling board filters its trainer dropdown by
// exactly this list, so a typo used to be the difference between a trainer
// appearing for a course and not — and until now the list had no UI at all,
// only scripts/seed-trainers.mjs.
//
// Filtered rather than paged: GCC Lab's catalog is dozens of courses, and
// the same code (CSCC10) legitimately appears twice under different
// contractor categories, so the category is shown to tell them apart.
export interface PickableCourse {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
  contractorCategory: string | null;
}

export function CoursePicker({
  courses,
  selected,
  onChange,
  locale,
}: {
  courses: PickableCourse[];
  selected: number[];
  onChange: (courseIds: number[]) => void;
  locale: string;
}) {
  const t = useTranslations("superadmin.trainers");
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? courses.filter(
        (c) =>
          c.code.toLowerCase().includes(needle) ||
          c.titleEn.toLowerCase().includes(needle) ||
          c.titleAr.includes(filter.trim())
      )
    : courses;

  function toggle(courseId: number) {
    onChange(selected.includes(courseId) ? selected.filter((id) => id !== courseId) : [...selected, courseId]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("coursesLabel")}</span>
        <span className="text-xs text-muted-foreground">{t("coursesSelected", { count: selected.length })}</span>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("coursesFilterPlaceholder")}
        aria-label={t("coursesFilterPlaceholder")}
      />

      <div className="grid max-h-56 grid-cols-1 content-start gap-0.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.length === 0 ? (
          <p className="col-span-full p-2 text-xs text-muted-foreground">{t("coursesNoMatch")}</p>
        ) : (
          visible.map((course) => (
            <label key={course.id} className="flex items-start gap-2 rounded-md p-1.5 text-xs hover:bg-muted">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 shrink-0"
                checked={selected.includes(course.id)}
                onChange={() => toggle(course.id)}
              />
              <span className="flex flex-col">
                <span className="font-medium">
                  {course.code}
                  {course.contractorCategory ? (
                    <span className="ms-1.5 font-normal text-muted-foreground">({course.contractorCategory})</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">{locale === "ar" ? course.titleAr : course.titleEn}</span>
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex gap-3 text-xs">
        <button type="button" className="text-primary hover:underline" onClick={() => onChange(visible.map((c) => c.id))}>
          {t("coursesSelectAll")}
        </button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange([])}>
          {t("coursesClear")}
        </button>
      </div>
    </div>
  );
}
