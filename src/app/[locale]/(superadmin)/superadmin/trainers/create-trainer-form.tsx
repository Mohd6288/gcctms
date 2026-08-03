"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createTrainerAction } from "@/modules/catalog/actions";

export function CreateTrainerForm() {
  const t = useTranslations("superadmin.trainers");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await createTrainerAction({ email, fullName, qualifications: qualifications || undefined });
      setResult({ tempPassword: created.tempPassword });
      setEmail("");
      setFullName("");
      setQualifications("");
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
      <CardContent className="flex flex-col gap-4">
        {result ? (
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">{t("successTempPassword")}</p>
            <p className="mt-1 font-mono">{result.tempPassword}</p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qualifications">{t("qualificationsLabel")}</Label>
            <Input id="qualifications" value={qualifications} onChange={(e) => setQualifications(e.target.value)} />
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
