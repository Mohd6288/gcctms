"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { createDraftRequestAction, submitRequestAction, syncRequestItemsAction, updateDraftRequestAction } from "@/modules/requests/actions";
import { uploadDocumentAction } from "@/modules/platform/storage/actions";
import { getEmployeeEligibilitySnapshotAction } from "@/modules/catalog/actions";
import { DocumentUploadSlot, type DocumentSlotStatus } from "@/components/documents/document-upload-slot";
import { AddEmployeePanel } from "./add-employee-panel";
import { ImportEmployeesPanel } from "./import-employees-panel";

const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const IMAGE_ACCEPT = "image/jpeg,image/png,application/pdf";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const TRAINING_TYPES = ["on_site", "training_center", "virtual_theory_onsite_practical"] as const;
type Region = (typeof REGIONS)[number];
type TrainingType = (typeof TRAINING_TYPES)[number];

interface CourseOption {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
}

const OHS_COURSE_CODE = "CSCC00";

interface EmployeeOption {
  id: number;
  fullNameEn: string;
  fullNameAr: string;
}

interface EmployeeDocument {
  id: number;
  employeeId: number;
  type: "national_id" | "prior_certificate" | "other";
  originalName: string;
}

interface RequestDocInfo {
  id: number;
  type: "registration_sheet" | "hrbl_request_form";
  originalName: string;
  verifiedAt: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

interface JobRoleOption {
  id: number;
  nameEn: string;
  nameAr: string;
}

interface EligibilityInfo {
  jobRoleEligible: boolean;
  hasRoleRestriction: boolean;
  missingPrerequisites: boolean;
  hasPrerequisiteRequirement: boolean;
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
  employeeDocuments,
  jobRoles,
  locale,
}: {
  requestId: number | null;
  initialFields: RequestWizardFields;
  companyId: number;
  courses: CourseOption[];
  companyEmployees: EmployeeOption[];
  initialSelectedEmployeeIds: number[];
  employeeDocuments: EmployeeDocument[];
  initialRequestDocs: RequestDocInfo[];
  jobRoles: JobRoleOption[];
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
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [eligibility, setEligibility] = useState<Map<number, EligibilityInfo>>(new Map());

  // Advisory-only badges (never block adding an employee or submitting —
  // matches the validated prototype's Step2Employees.tsx exactly).
  useEffect(() => {
    // Stale badges just stop being fetched (not actively cleared) once these
    // conditions no longer hold — they naturally get overwritten next time
    // step 2 is reached with a course and at least one employee selected.
    if (step !== 2 || !courseId || selectedEmployeeIds.size === 0) return;
    let cancelled = false;
    getEmployeeEligibilitySnapshotAction(courseId, Array.from(selectedEmployeeIds)).then((rows) => {
      if (cancelled) return;
      setEligibility(new Map(rows.map((r) => [r.employeeId, r])));
    });
    return () => {
      cancelled = true;
    };
  }, [step, courseId, selectedEmployeeIds]);

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
        { id: uploaded.id, type, originalName: file.name, verifiedAt: null, rejectedAt: null, rejectionReason: null },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setUploadingType(null);
    }
  }

  async function handleUploadEmployeeDoc(employeeId: number, type: "national_id" | "prior_certificate" | "other", file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploadingType(`${employeeId}:${type}`);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("companyId", String(companyId));
      formData.set("employeeId", String(employeeId));
      formData.set("type", type);
      await uploadDocumentAction(formData);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
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
  const selectedCourse = courses.find((c) => c.id === courseId);
  const ohsCourse = courses.find((c) => c.code === OHS_COURSE_CODE);

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

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowImport(false);
                  setShowAddEmployee((v) => !v);
                }}
              >
                {t("addEmployeeButton")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddEmployee(false);
                  setShowImport((v) => !v);
                }}
              >
                {t("importButton")}
              </Button>
            </div>

            {showAddEmployee ? (
              <AddEmployeePanel
                companyId={companyId}
                jobRoles={jobRoles}
                locale={locale}
                onClose={() => setShowAddEmployee(false)}
                onCreated={(employee) => {
                  setSelectedEmployeeIds((prev) => new Set(prev).add(employee.id));
                  setShowAddEmployee(false);
                  router.refresh();
                }}
              />
            ) : null}

            {showImport ? (
              <ImportEmployeesPanel
                companyId={companyId}
                onClose={() => setShowImport(false)}
                onImported={(created) => {
                  setSelectedEmployeeIds((prev) => {
                    const next = new Set(prev);
                    created.forEach((c) => next.add(c.id));
                    return next;
                  });
                  router.refresh();
                }}
              />
            ) : null}

            {companyEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noEmployees")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {companyEmployees.map((employee) => {
                  const info = eligibility.get(employee.id);
                  return (
                    <li key={employee.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          id={`employee-${employee.id}`}
                          checked={selectedEmployeeIds.has(employee.id)}
                          onChange={() => toggleEmployee(employee.id)}
                        />
                        <label htmlFor={`employee-${employee.id}`} className="text-sm">
                          {locale === "ar" ? employee.fullNameAr : employee.fullNameEn}
                        </label>
                        {info?.hasRoleRestriction ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              info.jobRoleEligible ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {info.jobRoleEligible ? t("badgeEligible") : t("badgeRoleNotEligible")}
                          </span>
                        ) : null}
                        {info?.hasPrerequisiteRequirement ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              info.missingPrerequisites ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {info.missingPrerequisites ? t("badgeMissingPrerequisite") : t("badgeEligible")}
                          </span>
                        ) : null}
                      </div>
                      {info?.missingPrerequisites && ohsCourse ? (
                        <p className="pl-6 text-xs text-muted-foreground">
                          {t("missingPrerequisiteHint", { course: locale === "ar" ? ohsCourse.titleAr : ohsCourse.titleEn })}{" "}
                          <Link
                            href={`/dashboard/requests/new?courseId=${ohsCourse.id}&employeeId=${employee.id}`}
                            target="_blank"
                            className="text-primary hover:underline"
                          >
                            {t("startOhsRequest")}
                          </Link>
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("documentsHint")}</p>
            {(["registration_sheet", "hrbl_request_form"] as const).map((type) => {
              const doc = requestDocs.find((d) => d.type === type);
              const isRegistrationSheet = type === "registration_sheet";
              const status: DocumentSlotStatus = doc?.rejectedAt ? "rejected" : doc?.verifiedAt ? "verified" : doc ? "pending" : "not_attached";
              return (
                <DocumentUploadSlot
                  key={type}
                  title={tDocs(isRegistrationSheet ? "registrationSheet" : "hrblForm")}
                  description={tDocs(isRegistrationSheet ? "registrationSheetDescription" : "hrblFormDescription")}
                  required
                  accept={XLSX_ACCEPT}
                  acceptHint={tDocs("acceptHintXlsx")}
                  status={status}
                  fileName={doc?.originalName}
                  downloadUrl={doc ? `/api/documents/${doc.id}/download` : null}
                  rejectionReason={doc?.rejectionReason}
                  templateUrl={isRegistrationSheet ? "/documents/Registration-sheet.xlsx" : "/documents/HRBL_0004_FO_001.xlsx"}
                  templateLabel={tDocs("downloadTemplate")}
                  uploading={uploadingType === type}
                  onSelectFile={(file) => handleUploadRequestDoc(type, file)}
                />
              );
            })}
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium">{t("employeeDocsTitle")}</p>
              {selectedEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("employeeDocsNoneSelected")}</p>
              ) : (
                selectedEmployees.map((employee) => {
                  const docs = employeeDocuments.filter((d) => d.employeeId === employee.id);
                  return (
                    <div key={employee.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{locale === "ar" ? employee.fullNameAr : employee.fullNameEn}</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(
                          [
                            { type: "national_id" as const, label: tDocs("nationalId"), description: tDocs("nationalIdDescription"), required: true },
                            {
                              type: "prior_certificate" as const,
                              label: tDocs("priorCertificate"),
                              description: tDocs("priorCertificateDescription"),
                              required: false,
                            },
                            { type: "other" as const, label: tDocs("other"), description: tDocs("otherDescription"), required: false },
                          ]
                        ).map(({ type, label, description, required }) => {
                          const doc = docs.find((d) => d.type === type);
                          const key = `${employee.id}:${type}`;
                          return (
                            <DocumentUploadSlot
                              key={type}
                              title={label}
                              description={description}
                              required={required}
                              accept={IMAGE_ACCEPT}
                              acceptHint={tDocs("acceptHintImage")}
                              status={doc ? "pending" : "not_attached"}
                              fileName={doc?.originalName}
                              downloadUrl={doc ? `/api/documents/${doc.id}/download` : null}
                              uploading={uploadingType === key}
                              onSelectFile={(file) => handleUploadEmployeeDoc(employee.id, type, file)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })
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
