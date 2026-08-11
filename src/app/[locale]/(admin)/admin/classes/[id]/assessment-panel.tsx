"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { Rubric } from "@/db/schema";
import type { AssessmentCandidate } from "@/modules/assessment/queries";
import { recordAssessmentAction } from "@/modules/assessment/actions";
import { requiredMark, scoreRubric } from "@/modules/assessment/score";
import { refusalMessage } from "@/modules/platform/guard-error";

interface Props {
  classId: number;
  rubric: Rubric | null;
  passMark: number | null;
  candidates: AssessmentCandidate[];
  canEdit: boolean;
  locale: string;
}

/**
 * Transcribing a signed Cable Technician Evaluation.
 *
 * The evaluator marks paper; an admin types it in. So the screen's whole job
 * is to make the paper's own rule visible while it is being typed — the same
 * scoreRubric() the server will use runs here on every keystroke, which is why
 * it is pure and free of the database.
 */
export function AssessmentPanel({ classId, rubric, passMark, candidates, canEdit, locale }: Props) {
  const t = useTranslations("admin.classes.assessment");
  const router = useRouter();
  const isAr = locale === "ar";

  const [openFor, setOpenFor] = useState<number | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [evaluatorName, setEvaluatorName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const parsedMarks = useMemo(() => {
    if (!rubric) return [];
    return rubric.parts.flatMap((part) =>
      rubric.criteria.map((criterion) => {
        const raw = marks[`${part.code}/${criterion.code}`];
        return {
          partCode: part.code,
          criterionCode: criterion.code,
          score: raw === undefined || raw === "" ? Number.NaN : Number(raw),
        };
      })
    );
  }, [marks, rubric]);

  // The same function the server runs. A verdict computed by different rules
  // in the screen would be worse than no verdict at all.
  const outcome = rubric && passMark != null ? scoreRubric(rubric, passMark, parsedMarks) : null;

  if (!rubric || passMark == null) {
    return (
      <section className="w-full max-w-3xl rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        {/* Thirteen of the fourteen evaluation forms are still to come, so a
            test can be requested and scheduled long before it can be marked.
            Saying which is missing beats a screen that simply does nothing. */}
        <p className="mt-2 text-sm text-muted-foreground">{t("noRubric")}</p>
      </section>
    );
  }

  function reset() {
    setMarks({});
    setEvaluatorName("");
    setError(null);
  }

  async function save(candidate: AssessmentCandidate) {
    setError(null);
    setSaving(true);
    try {
      const result = await recordAssessmentAction({
        classId,
        employeeId: candidate.employeeId,
        marks: parsedMarks.filter((m) => !Number.isNaN(m.score)),
        evaluatorName,
      });
      const refusal = refusalMessage(result);
      if (refusal) {
        setError(refusal);
        return;
      }
      setSaved(t("savedFor", { name: candidate.fullNameEn }));
      setOpenFor(null);
      reset();
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description", { passMark })}</p>
      </div>

      {/* Announced as well as shown — the same acknowledgement a sighted user
          gets. */}
      <div aria-live="polite">
        {saved ? (
          <p className="rounded-md bg-success/10 p-2.5 text-xs font-medium text-success">{saved}</p>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {candidates.map((candidate) => {
          const open = openFor === candidate.employeeId;
          return (
            <li key={candidate.employeeId} className="flex flex-col gap-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{candidate.fullNameEn}</span>
                  <span className="text-xs text-muted-foreground">
                    {candidate.priorAttempts > 0 ? t("reTest") : t("firstAttempt")}
                    {candidate.latestResult
                      ? ` · ${t("recorded", { result: t(candidate.latestResult === "pass" ? "pass" : "fail"), score: candidate.latestScore ?? 0 })}`
                      : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  variant={open ? "secondary" : "default"}
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => {
                    reset();
                    setOpenFor(open ? null : candidate.employeeId);
                  }}
                >
                  {open ? t("cancel") : candidate.latestResult ? t("recordAnother") : t("recordSheet")}
                </Button>
              </div>

              {open ? (
                <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
                  {/* Wide, and the first thing to break in RTL — so it scrolls
                      in its own container rather than pushing the page. */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[26rem] border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="pb-2 text-start text-xs font-medium text-muted-foreground">{t("criterion")}</th>
                          {rubric.parts.map((part) => (
                            <th key={part.code} className="pb-2 text-start text-xs font-medium text-muted-foreground">
                              {isAr ? part.ar : part.en}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rubric.criteria.map((criterion) => (
                          <tr key={criterion.code}>
                            <td className="py-1.5 pe-3">
                              <span>{isAr ? criterion.ar : criterion.en}</span>
                              <span className="ms-1 text-xs text-muted-foreground">
                                / {criterion.max} · {t("needs", { mark: requiredMark(criterion.max, passMark) })}
                              </span>
                            </td>
                            {rubric.parts.map((part) => {
                              const key = `${part.code}/${criterion.code}`;
                              const value = marks[key] ?? "";
                              const failing = value !== "" && Number(value) * 100 < criterion.max * passMark;
                              return (
                                <td key={key} className="py-1.5 pe-3">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={criterion.max}
                                    aria-label={`${isAr ? criterion.ar : criterion.en} — ${isAr ? part.ar : part.en}`}
                                    className={`h-8 w-20 ${failing ? "border-destructive text-destructive" : ""}`}
                                    value={value}
                                    onChange={(e) => setMarks((m) => ({ ...m, [key]: e.target.value }))}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* The verdict, as it is typed. 80 out of 100 with one
                      criterion under threshold is a fail, and the reason it
                      failed is named rather than left to be worked out. */}
                  <div aria-live="polite">
                    {outcome?.result === "incomplete" ? (
                      <p className="text-xs text-muted-foreground">
                        {outcome.invalid.length > 0
                          ? t("markOutOfRange", { max: outcome.invalid[0].max })
                          : t("marksRemaining", { count: outcome.missing.length })}
                      </p>
                    ) : outcome ? (
                      <div
                        className={`rounded-md p-2.5 text-xs ${
                          outcome.result === "pass" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        <span className="font-semibold">
                          {t(outcome.result === "pass" ? "pass" : "fail")} — {outcome.total}/{outcome.max}
                        </span>
                        {outcome.failures.length > 0 ? (
                          <span className="block font-normal">
                            {t("belowThreshold", {
                              criteria: outcome.failures
                                .map((f) => {
                                  const c = rubric.criteria.find((x) => x.code === f.criterionCode);
                                  return `${isAr ? c?.ar : c?.en} (${f.score}/${f.max})`;
                                })
                                .join("، "),
                            })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`evaluator-${candidate.employeeId}`}>{t("evaluatorLabel")}</Label>
                    <Input
                      id={`evaluator-${candidate.employeeId}`}
                      value={evaluatorName}
                      onChange={(e) => setEvaluatorName(e.target.value)}
                      placeholder={t("evaluatorPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("evaluatorHint")}</p>
                  </div>

                  {error ? <p className="text-xs text-destructive">{error}</p> : null}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving || outcome?.result === "incomplete" || evaluatorName.trim() === ""}
                      onClick={() => save(candidate)}
                    >
                      {saving ? t("saving") : t("saveSheet")}
                    </Button>
                    <span className="text-xs text-muted-foreground">{t("saveHint")}</span>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
