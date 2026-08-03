"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createExamAction } from "@/modules/catalog/actions";

export function CreateExamForm() {
  const t = useTranslations("superadmin.exams");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [passMark, setPassMark] = useState("70");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createExamAction({ code, title, passMark: Number(passMark) });
      setCode("");
      setTitle("");
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
            <Label htmlFor="title">{t("titleLabel")}</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passMark">{t("passMarkLabel")}</Label>
            <Input id="passMark" type="number" min="0" max="100" required value={passMark} onChange={(e) => setPassMark(e.target.value)} />
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
