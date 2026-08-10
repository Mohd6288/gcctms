"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { setAttendanceAction, setExamResultAction, submitResultsAction } from "@/modules/delivery/actions";

interface ClassData {
  id: number;
  courseCode: string;
  courseTitleEn: string;
  courseTitleAr: string;
  startDate: string;
  locationUrl: string | null;
  locationNote: string | null;
  endDate: string;
  status: string;
}
interface RosterRow {
  employeeId: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  companyName: string;
}
interface AttendanceRow {
  employeeId: number;
  sessionDate: string;
  present: boolean;
}
interface ExamResultRow {
  employeeId: number;
  score: number;
  result: string;
}

export function ClassDeliveryDetail({
  cls,
  roster,
  sessionDates,
  attendance,
  examResults,
  hasExam,
  passMark,
  locale,
}: {
  cls: ClassData;
  roster: RosterRow[];
  sessionDates: string[];
  attendance: AttendanceRow[];
  examResults: ExamResultRow[];
  hasExam: boolean;
  /** The course's pass mark — shown so the trainer can see what a score means. */
  passMark: number | null;
  locale: string;
}) {
  const t = useTranslations("trainer.classDetail");
  const router = useRouter();
  const [scoreDraft, setScoreDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notStarted = cls.status === "scheduled";
  const isDone = cls.status === "completed";
  const canEdit = cls.status === "in_progress";

  const attendanceByEmployee = new Map<number, Map<string, boolean>>();
  for (const row of attendance) {
    if (!attendanceByEmployee.has(row.employeeId)) attendanceByEmployee.set(row.employeeId, new Map());
    attendanceByEmployee.get(row.employeeId)!.set(row.sessionDate, row.present);
  }
  const resultByEmployee = new Map(examResults.map((r) => [r.employeeId, r]));

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setLoading(key);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  function attendancePct(employeeId: number) {
    const byDate = attendanceByEmployee.get(employeeId);
    if (!byDate || sessionDates.length === 0) return 100;
    const presentCount = sessionDates.filter((d) => byDate.get(d) !== false).length;
    return Math.round((presentCount / sessionDates.length) * 100);
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {cls.courseCode} — {locale === "ar" ? cls.courseTitleAr : cls.courseTitleEn}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {cls.startDate} – {cls.endDate} · {cls.status}
          </p>
          <p className="text-sm">
            {/* The trainer has to get there too, and until now the address
                lived in a WhatsApp message. */}
            {cls.locationUrl ? (
              <a href={cls.locationUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                {t("openLocation")}
              </a>
            ) : (
              <span className="text-muted-foreground">{t("noLocation")}</span>
            )}
            {cls.locationNote ? <span className="ms-2 text-xs text-muted-foreground">{cls.locationNote}</span> : null}
          </p>
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t("attirePolicy")}</p>
          {notStarted ? <p className="rounded-lg bg-muted p-3 text-sm">{t("notStarted")}</p> : null}
          {isDone ? <p className="rounded-lg bg-muted p-3 text-sm">{t("alreadySubmitted")}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rosterTitle", { count: roster.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rosterEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-2 text-start font-medium">{t("tableEmployee")}</th>
                    {sessionDates.map((d, i) => (
                      <th key={d} className="p-2 text-center font-medium">
                        D{i + 1}
                      </th>
                    ))}
                    <th className="p-2 text-center font-medium">{t("tableAttendance")}</th>
                    {hasExam ? <th className="p-2 text-center font-medium">{t("tableResult")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => {
                    const byDate = attendanceByEmployee.get(r.employeeId);
                    const result = resultByEmployee.get(r.employeeId);
                    const pct = attendancePct(r.employeeId);
                    return (
                      <tr key={r.employeeId} className="border-b border-border last:border-0">
                        <td className="p-2">
                          {locale === "ar" ? r.employeeFullNameAr : r.employeeFullNameEn}
                          <span className="block text-xs text-muted-foreground">{r.companyName}</span>
                        </td>
                        {sessionDates.map((d) => {
                          const present = byDate?.get(d) ?? true;
                          return (
                            <td key={d} className="p-1 text-center">
                              <button
                                type="button"
                                disabled={!canEdit || loading === `att-${r.employeeId}-${d}`}
                                onClick={() => run(`att-${r.employeeId}-${d}`, () => setAttendanceAction({ classId: cls.id, employeeId: r.employeeId, sessionDate: d, present: !present }))}
                                className={`h-7 w-7 rounded text-xs font-medium ${present ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"}`}
                              >
                                {present ? "✓" : "✕"}
                              </button>
                            </td>
                          );
                        })}
                        <td className={`p-2 text-center text-xs font-medium ${pct < 90 ? "text-destructive" : "text-muted-foreground"}`}>{pct}%</td>
                        {hasExam ? (
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                className="h-7 w-14 text-xs"
                                disabled={!canEdit}
                                value={scoreDraft[r.employeeId] ?? String(result?.score ?? "")}
                                onChange={(e) => setScoreDraft((prev) => ({ ...prev, [r.employeeId]: e.target.value }))}
                              />
                              {/* Save, not Pass/Fail. The outcome is the
                                  course's pass mark applied to the score —
                                  it was never the trainer's to choose, and
                                  before 0035 nothing stopped a 40 being
                                  filed as a pass on a 70 course. */}
                              <Button
                                type="button"
                                size="sm"
                                disabled={!canEdit || loading === `score-${r.employeeId}` || scoreDraft[r.employeeId] === undefined}
                                onClick={() =>
                                  run(`score-${r.employeeId}`, () =>
                                    setExamResultAction({
                                      classId: cls.id,
                                      employeeId: r.employeeId,
                                      score: Number(scoreDraft[r.employeeId] ?? result?.score ?? 0),
                                    })
                                  )
                                }
                              >
                                {t("saveScore")}
                              </Button>
                              {result ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    result.result === "pass" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                                  }`}
                                >
                                  {result.result === "pass" ? t("pass") : t("fail")}
                                </span>
                              ) : null}
                              {passMark != null ? (
                                <span className="text-[11px] text-muted-foreground">{t("passMarkNote", { mark: passMark })}</span>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Button type="button" disabled={roster.length === 0 || loading === "submit"} onClick={() => run("submit", () => submitResultsAction(cls.id))}>
          {loading === "submit" ? t("submitting") : t("submit")}
        </Button>
      ) : null}
    </div>
  );
}
