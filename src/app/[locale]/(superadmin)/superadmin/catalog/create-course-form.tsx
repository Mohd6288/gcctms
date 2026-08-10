"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CREATE_ACTIONS, CREATE_FIELD_WIDE, CREATE_GRID, useCreatePanelClose } from "@/components/ui/create-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createCourseAction } from "@/modules/catalog/actions";

const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;
const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function CreateCourseForm() {
  const t = useTranslations("superadmin.catalog");
  const router = useRouter();
  const closePanel = useCreatePanelClose();
  const [code, setCode] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState("8");
  const [minAttendancePct, setMinAttendancePct] = useState("90");
  const [contractorCategory, setContractorCategory] = useState<(typeof CONTRACTOR_CATEGORIES)[number] | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createCourseAction({
        code,
        titleEn,
        titleAr,
        description: description || undefined,
        durationHours: Number(durationHours),
        minAttendancePct: Number(minAttendancePct),
        contractorCategory: contractorCategory || undefined,
      });
      setCode("");
      setTitleEn("");
      setTitleAr("");
      setDescription("");
      router.refresh();
      closePanel();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={CREATE_GRID}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">{t("codeLabel")}</Label>
            <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleEn">{t("titleEnLabel")}</Label>
            <Input id="titleEn" required value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleAr">{t("titleArLabel")}</Label>
            <Input id="titleAr" dir="rtl" required value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </div>
          <div className={`flex flex-col gap-1.5 ${CREATE_FIELD_WIDE}`}>
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="durationHours">{t("durationLabel")}</Label>
            <Input id="durationHours" type="number" min="0.5" step="0.5" required value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minAttendancePct">{t("minAttendanceLabel")}</Label>
            <Input
              id="minAttendancePct"
              type="number"
              min="1"
              max="100"
              required
              value={minAttendancePct}
              onChange={(e) => setMinAttendancePct(e.target.value)}
            />
          </div>
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
      <div className={CREATE_ACTIONS}>
        <Button type="submit" disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
