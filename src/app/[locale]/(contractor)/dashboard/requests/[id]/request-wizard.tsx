"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createDraftRequestAction, submitRequestAction, syncRequestItemsAction, updateDraftRequestAction } from "@/modules/requests/actions";
import { uploadDocumentAction } from "@/modules/platform/storage/actions";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const TRAINING_TYPES = ["on_site", "training_center", "virtual_theory_onsite_practical"] as const;
type Region = (typeof REGIONS)[number];
type TrainingType = (typeof TRAINING_TYPES)[number];

interface CourseOption {
  id: number;
  titleEn: string;
  titleAr: string;
}

interface EmployeeOption {
  id: number;
  fullNameEn: string;
  fullNameAr: string;
  hasNationalId: boolean;
}

interface RequestDocInfo {
  id: number;
  type: "registration_sheet" | "hrbl_request_form";
  originalName: string;
  verifiedAt: string | null;
}

interface RequestWizardFields {
  courseId: number | null;
  preferredRegion: string | null;
  preferredCity: string | null;
  preferredTrainingType: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  notes: string | null;
}

export function RequestWizard({
  requestId: initialRequestId,
  initialFields,
  companyId,
  courses,
  companyEmployees,
  initialSelectedEmployeeIds,
  initialRequestDocs,
  locale,
}: {
  requestId: number | null;
  initialFields: RequestWizardFields;
  companyId: number;
  courses: CourseOption[];
  companyEmployees: EmployeeOption[];
  initialSelectedEmployeeIds: number[];
  initialRequestDocs: RequestDocInfo[];
  locale: string;
}) {
  const t = useTranslations("contractor.requests.wizard");
  const tDocs = useTranslations("contractor.requests.documents");
  const router = useRouter();

  const [requestId, setRequestId] = useState(initialRequestId);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [courseId, setCourseId] = useState<number | null>(initialFields.courseId ?? courses[0]?.id ?? null);
  const [preferredRegion, setPreferredRegion] = useState<Region | "">((initialFields.preferredRegion as Region) ?? "");
  const [preferredCity, setPreferredCity] = useState(initialFields.preferredCity ?? "");
  const [preferredTrainingType, setPreferredTrainingType] = useState<TrainingType | "">(
    (initialFields.preferredTrainingType as TrainingType) ?? ""
  );
  const [preferredStartDate, setPreferredStartDate] = useState(initialFields.preferredStartDate ?? "");
  const [preferredEndDate, setPreferredEndDate] = useState(initialFields.preferredEndDate ?? "");
  const [notes, setNotes] = useState(initialFields.notes ?? "");

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set(initialSelectedEmployeeIds));
  const [requestDocs, setRequestDocs] = useState<RequestDocInfo[]>(initialRequestDocs);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  function toggleEmployee(id: number) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStep1Next() {
    if (!courseId) {
      setError(t("genericError"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fields = {
        courseId,
        preferredRegion: preferredRegion || undefined,
        preferredCity: preferredCity || undefined,
        preferredTrainingType: preferredTrainingType || undefined,
        preferredStartDate: preferredStartDate || undefined,
        preferredEndDate: preferredEndDate || undefined,
        notes: notes || undefined,
      } as const;

      if (requestId === null) {
        const created = await createDraftRequestAction(fields);
        setRequestId(created.id);
      } else {
        await updateDraftRequestAction({ requestId, ...fields });
      }
      setStep(2);
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!requestId) return;
    setError(null);
    setLoading(true);
    try {
      await syncRequestItemsAction({ requestId, employeeIds: Array.from(selectedEmployeeIds) });
      setStep(3);
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadRequestDoc(type: "registration_sheet" | "hrbl_request_form", file: File | undefined) {
    if (!requestId || !file) return;
    setError(null);
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("companyId", String(companyId));
      formData.set("requestId", String(requestId));
      formData.set("type", type);
      const uploaded = await uploadDocumentAction(formData);
      setRequestDocs((prev) => [
        ...prev.filter((d) => d.type !== type),
        { id: uploaded.id, type, originalName: file.name, verifiedAt: null },
      ]);
    } catch {
      setError(tDocs("attach") + ": " + t("genericError"));
    } finally {
      setUploadingType(null);
    }
  }

  async function handleSubmit() {
    if (!requestId) return;
    setError(null);
    setLoading(true);
    try {
      await submitRequestAction(requestId);
      router.push("/dashboard/requests");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  const selectedEmployees = companyEmployees.filter((e) => selectedEmployeeIds.has(e.id));
  const missingDocsEmployees = selectedEmployees.filter((e) => !e.hasNationalId);
  const selectedCourse = courses.find((c) => c.id === courseId);

  const steps = [t("stepInfo"), t("stepEmployees"), t("stepDocuments"), t("stepReview")];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          {steps.map((label, i) => (
            <span key={label} className={i + 1 === step ? "text-foreground" : "text-muted-foreground"}>
              {i > 0 ? " · " : ""}
              {label}
            </span>
          ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="courseId">{t("courseLabel")}</Label>
              <select
                id="courseId"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={courseId ?? ""}
                onChange={(e) => setCourseId(Number(e.target.value))}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === "ar" ? c.titleAr : c.titleEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredRegion">{t("regionLabel")}</Label>
              <select
                id="preferredRegion"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={preferredRegion}
                onChange={(e) => setPreferredRegion(e.target.value as Region | "")}
              >
                <option value="">{t("regionNone")}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredCity">{t("cityLabel")}</Label>
              <Input id="preferredCity" value={preferredCity} onChange={(e) => setPreferredCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredTrainingType">{t("trainingTypeLabel")}</Label>
              <select
                id="preferredTrainingType"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={preferredTrainingType}
                onChange={(e) => setPreferredTrainingType(e.target.value as TrainingType | "")}
              >
                <option value="">{t("trainingTypeNone")}</option>
                {TRAINING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`trainingType${type === "on_site" ? "OnSite" : type === "training_center" ? "Center" : "Virtual"}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="preferredStartDate">{t("startDateLabel")}</Label>
                <Input id="preferredStartDate" type="date" value={preferredStartDate} onChange={(e) => setPreferredStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="preferredEndDate">{t("endDateLabel")}</Label>
                <Input id="preferredEndDate" type="date" value={preferredEndDate} onChange={(e) => setPreferredEndDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("datesHint")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">{t("notesLabel")}</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("employeesHint")}</p>
            {companyEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noEmployees")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {companyEmployees.map((employee) => (
                  <li key={employee.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`employee-${employee.id}`}
                      checked={selectedEmployeeIds.has(employee.id)}
                      onChange={() => toggleEmployee(employee.id)}
                    />
                    <label htmlFor={`employee-${employee.id}`} className="text-sm">
                      {locale === "ar" ? employee.fullNameAr : employee.fullNameEn}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("documentsHint")}</p>
            {(["registration_sheet", "hrbl_request_form"] as const).map((type) => {
              const doc = requestDocs.find((d) => d.type === type);
              return (
                <div key={type} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{tDocs(type === "registration_sheet" ? "registrationSheet" : "hrblForm")}</span>
                    <span className="text-xs text-muted-foreground">
                      {doc ? (doc.verifiedAt ? tDocs("verified") : tDocs("pendingVerification")) : tDocs("notAttached")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(e) => handleUploadRequestDoc(type, e.target.files?.[0])}
                      className="text-sm"
                    />
                    {uploadingType === type ? <span className="text-xs text-muted-foreground">{tDocs("attaching")}</span> : null}
                  </div>
                </div>
              );
            })}
            <div>
              <p className="text-sm font-medium">{t("employeeDocsTitle")}</p>
              {missingDocsEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("employeeDocsComplete")}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t("employeeDocsMissing")}</p>
                  <ul className="list-inside list-disc text-sm">
                    {missingDocsEmployees.map((e) => (
                      <li key={e.id}>{locale === "ar" ? e.fullNameAr : e.fullNameEn}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{t("reviewTitle")}</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("courseLabel")}</dt>
              <dd>{selectedCourse ? (locale === "ar" ? selectedCourse.titleAr : selectedCourse.titleEn) : "—"}</dd>
              <dt className="text-muted-foreground">{t("regionLabel")}</dt>
              <dd>{preferredRegion || "—"}</dd>
              <dt className="text-muted-foreground">{t("stepEmployees")}</dt>
              <dd>{selectedEmployees.length}</dd>
            </dl>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
          {step < 4 ? (
            <Button type="button" disabled={loading} onClick={step === 1 ? handleStep1Next : step === 2 ? handleStep2Next : () => setStep(4)}>
              {t("next")}
            </Button>
          ) : (
            <Button type="button" disabled={loading} onClick={handleSubmit}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
