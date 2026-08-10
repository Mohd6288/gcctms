"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createClassAction } from "@/modules/scheduling/actions";
import { TrainerSelect, type TrainerOption } from "@/components/scheduling/trainer-select";
import { REGIONS } from "@/lib/regions";

const CLASS_TYPES = ["public", "private"] as const;
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface CourseOption {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
}
interface CenterOption {
  id: number;
  name: string;
}
interface CompanyOption {
  id: number;
  name: string;
}

export function NewClassForm({
  courses,
  trainers,
  trainerCourses,
  centers,
  companies,
  initialRegion,
  locale,
}: {
  courses: CourseOption[];
  trainers: TrainerOption[];
  trainerCourses: { trainerId: number; courseId: number }[];
  centers: CenterOption[];
  companies: CompanyOption[];
  initialRegion?: (typeof REGIONS)[number];
  locale: string;
}) {
  const t = useTranslations("admin.classes.form");
  const router = useRouter();

  const [courseId, setCourseId] = useState<number | "">(courses[0]?.id ?? "");
  // Default to someone certified for the starting course, not simply the
  // first name on the roster.
  const [trainerId, setTrainerId] = useState<number | "">(() => firstQualified(courses[0]?.id ?? "") ?? "");
  const [showAllTrainers, setShowAllTrainers] = useState(false);

  function firstQualified(forCourseId: number | "") {
    const ids = new Set(trainerCourses.filter((tc) => tc.courseId === forCourseId).map((tc) => tc.trainerId));
    return trainers.find((tr) => ids.has(tr.id))?.id;
  }

  // Changing the course changes who is certified, so a trainer left selected
  // from the previous course would quietly become an unflagged override.
  function handleCourseChange(nextCourseId: number) {
    setCourseId(nextCourseId);
    const next = firstQualified(nextCourseId);
    if (next !== undefined) {
      setTrainerId(next);
      setShowAllTrainers(false);
    } else {
      setTrainerId("");
    }
  }
  const [centerId, setCenterId] = useState<number | "">("");
  const [region, setRegion] = useState<(typeof REGIONS)[number]>(initialRegion ?? "Central");
  const [type, setType] = useState<(typeof CLASS_TYPES)[number]>("public");
  const [companyId, setCompanyId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = courseId && trainerId && region && type && startDate && endDate && Number(capacity) > 0 && (type === "public" || companyId);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const created = await createClassAction({
        courseId: Number(courseId),
        trainerId: Number(trainerId),
        centerId: centerId ? Number(centerId) : undefined,
        region,
        type,
        companyId: type === "private" ? Number(companyId) : undefined,
        startDate,
        endDate,
        capacity: Number(capacity),
      });
      router.push(`/admin/classes/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="courseId">{t("courseLabel")}</Label>
          <select id="courseId" className={selectClassName} value={courseId} onChange={(e) => handleCourseChange(Number(e.target.value))}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {locale === "ar" ? c.titleAr : c.titleEn}
              </option>
            ))}
          </select>
        </div>
        <TrainerSelect
          id="trainerId"
          trainers={trainers}
          trainerCourses={trainerCourses}
          courseId={courseId}
          value={trainerId}
          onChange={setTrainerId}
          showAll={showAllTrainers}
          onShowAllChange={setShowAllTrainers}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="centerId">{t("centerLabel")}</Label>
          <select id="centerId" className={selectClassName} value={centerId} onChange={(e) => setCenterId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">{t("centerNone")}</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region">{t("regionLabel")}</Label>
          <select id="region" className={selectClassName} value={region} onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number])}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">{t("typeLabel")}</Label>
          <select id="type" className={selectClassName} value={type} onChange={(e) => setType(e.target.value as (typeof CLASS_TYPES)[number])}>
            {CLASS_TYPES.map((ct) => (
              <option key={ct} value={ct}>
                {ct === "public" ? t("typePublic") : t("typePrivate")}
              </option>
            ))}
          </select>
        </div>
        {type === "private" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyId">{t("companyLabel")}</Label>
            <select id="companyId" className={selectClassName} value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{t("companyNone")}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">{t("startDateLabel")}</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endDate">{t("endDateLabel")}</Label>
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="capacity">{t("capacityLabel")}</Label>
          <Input id="capacity" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <Button type="button" disabled={!canSubmit || loading} onClick={handleSubmit}>
          {loading ? t("submitting") : t("submit")}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
