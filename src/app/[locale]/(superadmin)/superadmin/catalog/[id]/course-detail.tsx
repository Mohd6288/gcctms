"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createPricingAction, setCoursePrerequisitesAction, setCourseJobRolesAction, updateCourseAction } from "@/modules/catalog/actions";
import { REGIONS } from "@/lib/regions";

const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface CourseData {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
  description: string | null;
  durationHours: string;
  minAttendancePct: number;
  examRequired: boolean;
  passMark: number | null;
  contractorCategory: string | null;
  active: boolean;
}

interface JobRoleOption {
  id: number;
  nameEn: string;
  nameAr: string;
}

interface CourseOption {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
}

interface PricingRow {
  id: number;
  region: string | null;
  price: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function CourseDetail({
  course,
  jobRoles,
  initialSelectedJobRoleIds,
  otherCourses,
  initialSelectedPrerequisiteCourseIds,
  pricingRows,
  locale,
}: {
  course: CourseData;
  jobRoles: JobRoleOption[];
  initialSelectedJobRoleIds: number[];
  otherCourses: CourseOption[];
  initialSelectedPrerequisiteCourseIds: number[];
  pricingRows: PricingRow[];
  locale: string;
}) {
  const t = useTranslations("superadmin.catalog");
  const router = useRouter();

  const [code, setCode] = useState(course.code);
  const [titleEn, setTitleEn] = useState(course.titleEn);
  const [titleAr, setTitleAr] = useState(course.titleAr);
  const [description, setDescription] = useState(course.description ?? "");
  const [durationHours, setDurationHours] = useState(course.durationHours);
  const [minAttendancePct, setMinAttendancePct] = useState(String(course.minAttendancePct));
  const [contractorCategory, setContractorCategory] = useState<(typeof CONTRACTOR_CATEGORIES)[number] | "">(
    (course.contractorCategory as (typeof CONTRACTOR_CATEGORIES)[number] | null) ?? ""
  );
  const [active, setActive] = useState(course.active);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const [selectedJobRoleIds, setSelectedJobRoleIds] = useState<Set<number>>(new Set(initialSelectedJobRoleIds));
  const [selectedPrerequisiteCourseIds, setSelectedPrerequisiteCourseIds] = useState<Set<number>>(
    new Set(initialSelectedPrerequisiteCourseIds)
  );

  const [examRequired, setExamRequired] = useState(course.examRequired);
  const [passMark, setPassMark] = useState(String(course.passMark ?? 70));

  const [region, setRegion] = useState("");
  const [price, setPrice] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");

  async function handleSaveCourse() {
    setError(null);
    setLoading("course");
    try {
      await updateCourseAction({
        courseId: course.id,
        code,
        titleEn,
        titleAr,
        description: description || undefined,
        durationHours: Number(durationHours),
        minAttendancePct: Number(minAttendancePct),
        contractorCategory: contractorCategory || undefined,
        examRequired,
        passMark: examRequired ? Number(passMark) : undefined,
        active,
      });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  function toggleJobRole(id: number) {
    setSelectedJobRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveJobRoles() {
    setError(null);
    setLoading("jobRoles");
    try {
      await setCourseJobRolesAction({ courseId: course.id, jobRoleIds: Array.from(selectedJobRoleIds) });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  function togglePrerequisite(id: number) {
    setSelectedPrerequisiteCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSavePrerequisites() {
    setError(null);
    setLoading("prerequisites");
    try {
      await setCoursePrerequisitesAction({ courseId: course.id, prerequisiteCourseIds: Array.from(selectedPrerequisiteCourseIds) });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleAddPricing() {
    if (!price || !effectiveFrom) return;
    setError(null);
    setLoading("pricing");
    try {
      await createPricingAction({
        courseId: course.id,
        region: region ? (region as (typeof REGIONS)[number]) : undefined,
        price: Number(price),
        effectiveFrom,
      });
      setPrice("");
      setEffectiveFrom("");
      setRegion("");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">{t("codeLabel")}</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleEn">{t("titleEnLabel")}</Label>
            <Input id="titleEn" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleAr">{t("titleArLabel")}</Label>
            <Input id="titleAr" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="durationHours">{t("durationLabel")}</Label>
            <Input id="durationHours" type="number" min="0.5" step="0.5" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minAttendancePct">{t("minAttendanceLabel")}</Label>
            <Input id="minAttendancePct" type="number" min="1" max="100" value={minAttendancePct} onChange={(e) => setMinAttendancePct(e.target.value)} />
          </div>
          {/* The old Exams screen's two fields, now where they belong (0035). */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="examRequired">{t("examLabel")}</Label>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input id="examRequired" type="checkbox" className="size-3.5" checked={examRequired} onChange={(e) => setExamRequired(e.target.checked)} />
              {t("examRequiredLabel")}
            </label>
          </div>
          {examRequired ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="passMark">{t("passMarkLabel")}</Label>
              <Input id="passMark" type="number" min="0" max="100" value={passMark} onChange={(e) => setPassMark(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("passMarkHint")}</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contractorCategory">{t("contractorCategoryLabel")}</Label>
            <select
              id="contractorCategory"
              className={selectClassName}
              value={contractorCategory}
              onChange={(e) => setContractorCategory(e.target.value as (typeof CONTRACTOR_CATEGORIES)[number] | "")}
            >
              <option value="">{t("contractorCategoryNone")}</option>
              {CONTRACTOR_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <Label htmlFor="active">{t("statusLabel")}</Label>
          </div>
          <Button type="button" disabled={loading === "course"} onClick={handleSaveCourse}>
            {loading === "course" ? t("submitting") : t("submit")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("jobRolesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("jobRolesHint")}</p>
          <ul className="flex flex-col gap-2">
            {jobRoles.map((role) => (
              <li key={role.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`role-${role.id}`}
                  checked={selectedJobRoleIds.has(role.id)}
                  onChange={() => toggleJobRole(role.id)}
                />
                <label htmlFor={`role-${role.id}`} className="text-sm">
                  {locale === "ar" ? role.nameAr : role.nameEn}
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" disabled={loading === "jobRoles"} onClick={handleSaveJobRoles}>
            {t("saveJobRoles")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("prerequisitesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("prerequisitesHint")}</p>
          {otherCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("prerequisitesEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {otherCourses.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`prereq-${c.id}`}
                    checked={selectedPrerequisiteCourseIds.has(c.id)}
                    onChange={() => togglePrerequisite(c.id)}
                  />
                  <label htmlFor={`prereq-${c.id}`} className="text-sm">
                    {c.code} — {locale === "ar" ? c.titleAr : c.titleEn}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" disabled={loading === "prerequisites"} onClick={handleSavePrerequisites}>
            {t("savePrerequisites")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pricingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("pricingHint")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-start font-medium">{t("tableRegion")}</th>
                <th className="p-2 text-start font-medium">{t("tablePrice")}</th>
                <th className="p-2 text-start font-medium">{t("tableEffectiveFrom")}</th>
                <th className="p-2 text-start font-medium">{t("tableEffectiveTo")}</th>
              </tr>
            </thead>
            <tbody>
              {pricingRows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="p-2">{row.region ?? t("regionDefault")}</td>
                  <td className="p-2">{row.price}</td>
                  <td className="p-2">{row.effectiveFrom}</td>
                  <td className="p-2">{row.effectiveTo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region">{t("regionLabel")}</Label>
              <select
                id="region"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">{t("regionDefault")}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">{t("priceLabel")}</Label>
              <Input id="price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effectiveFrom">{t("effectiveFromLabel")}</Label>
              <Input id="effectiveFrom" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <Button type="button" disabled={loading === "pricing"} onClick={handleAddPricing}>
              {t("addPricing")}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
