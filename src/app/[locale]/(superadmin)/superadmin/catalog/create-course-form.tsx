"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createCourseAction } from "@/modules/catalog/actions";

export function CreateCourseForm() {
  const t = useTranslations("superadmin.catalog");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState("8");
  const [minAttendancePct, setMinAttendancePct] = useState("90");
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
      });
      setCode("");
      setTitleEn("");
      setTitleAr("");
      setDescription("");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("createTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-1.5">
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
