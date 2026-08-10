"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { refusalMessage } from "@/modules/platform/guard-error";
import { changeRequestCourseAction, reassignRequestAction } from "@/modules/requests/actions";

// The two corrections that used to mean rejecting the request and starting
// again: it landed with the wrong admin, or it is for the wrong course.
//
// Both are deliberately on the review screen rather than buried in a menu —
// an admin who cannot fix a request in front of them tends to work around it
// instead, and the workaround is a second request nobody reconciles.
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function RequestOwnershipPanel({
  requestId,
  status,
  assignedAdminUserId,
  assignedAdminName,
  admins,
  courseId,
  courses,
  locale,
}: {
  requestId: number;
  status: string;
  assignedAdminUserId: string | null;
  assignedAdminName: string | null;
  admins: { userId: string; fullName: string; region: string | null }[];
  courseId: number;
  courses: { id: number; code: string; titleEn: string; titleAr: string }[];
  locale: string;
}) {
  const t = useTranslations("admin.requests.ownership");
  const router = useRouter();
  const [assignee, setAssignee] = useState(assignedAdminUserId ?? "");
  const [nextCourseId, setNextCourseId] = useState(courseId);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mirrors changeRequestCourse's own guard. Shown as a disabled control with
  // the reason rather than hidden, so it is clear the option exists and why
  // it has closed — Server Action messages are redacted in production, so a
  // refusal must be prevented here, not reported afterwards.
  const courseChangeable = status === "draft" || status === "submitted" || status === "info_requested";

  async function run(key: string, work: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    setPending(key);
    try {
      // A refusal comes back as a value; only a real failure throws. In
      // production a thrown Error is replaced by React's minified #441 text,
      // so the reason has to travel as data.
      const refusal = refusalMessage(await work());
      if (refusal) {
        setError(refusal);
        return;
      }
      setNotice(done);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">
          {assignedAdminName ? t("assignedTo", { name: assignedAdminName }) : t("unassigned")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="assignee" className="text-xs font-medium">
            {t("assigneeLabel")}
          </label>
          <select id="assignee" className={selectClassName} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t("assigneeNone")}</option>
            {admins.map((admin) => (
              <option key={admin.userId} value={admin.userId}>
                {admin.fullName}
                {admin.region ? ` — ${admin.region}` : ` — ${t("adminUnscoped")}`}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending !== null || assignee === (assignedAdminUserId ?? "")}
            onClick={() =>
              run("assign", () => reassignRequestAction({ requestId, adminUserId: assignee === "" ? null : assignee }), t("assignDone"))
            }
          >
            {pending === "assign" ? t("saving") : t("assignAction")}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="course" className="text-xs font-medium">
            {t("courseLabel")}
          </label>
          <select
            id="course"
            className={selectClassName}
            value={nextCourseId}
            disabled={!courseChangeable}
            onChange={(e) => setNextCourseId(Number(e.target.value))}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {locale === "ar" ? course.titleAr : course.titleEn}
              </option>
            ))}
          </select>
          {courseChangeable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending !== null || nextCourseId === courseId}
              onClick={() => run("course", () => changeRequestCourseAction({ requestId, courseId: nextCourseId }), t("courseDone"))}
            >
              {pending === "course" ? t("saving") : t("courseAction")}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("courseLocked")}</p>
          )}
        </div>
      </div>

      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
