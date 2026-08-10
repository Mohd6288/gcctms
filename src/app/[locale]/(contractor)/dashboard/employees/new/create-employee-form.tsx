"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createEmployeeAction } from "@/modules/employees/actions";

interface JobRole {
  id: number;
  nameEn: string;
  nameAr: string;
}

export function CreateEmployeeForm({ companyId, jobRoles, locale }: { companyId: number; jobRoles: JobRole[]; locale: string }) {
  const t = useTranslations("contractor.employees");
  const router = useRouter();
  const [fullNameEn, setFullNameEn] = useState("");
  const [fullNameAr, setFullNameAr] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [jobRoleId, setJobRoleId] = useState(jobRoles[0]?.id ?? 0);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [activity, setActivity] = useState("");
  const [contractorArea, setContractorArea] = useState("");
  const [contractorCity, setContractorCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createEmployeeAction({
        companyId,
        fullNameEn,
        fullNameAr,
        nationalId,
        jobRoleId,
        email,
        phone,
        nationality,
        activity,
        contractorArea,
        contractorCity,
      });
      router.push("/dashboard/employees");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>{t("createTitle")}</CardTitle>
        <CardDescription>{t("createDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullNameEn">{t("fullNameEnLabel")}</Label>
            <Input id="fullNameEn" required value={fullNameEn} onChange={(e) => setFullNameEn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullNameAr">{t("fullNameArLabel")}</Label>
            <Input id="fullNameAr" dir="rtl" required value={fullNameAr} onChange={(e) => setFullNameAr(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nationalId">{t("nationalIdLabel")}</Label>
            <Input
              id="nationalId"
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              required
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jobRoleId">{t("jobRoleLabel")}</Label>
            <select
              id="jobRoleId"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={jobRoleId}
              onChange={(e) => setJobRoleId(Number(e.target.value))}
            >
              {jobRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {locale === "ar" ? role.nameAr : role.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">{t("phoneLabel")}</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nationality">{t("nationalityLabel")}</Label>
            <Input id="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity">{t("activityLabel")}</Label>
            <Input id="activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contractorArea">{t("contractorAreaLabel")}</Label>
            <Input id="contractorArea" value={contractorArea} onChange={(e) => setContractorArea(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contractorCity">{t("contractorCityLabel")}</Label>
            <Input id="contractorCity" value={contractorCity} onChange={(e) => setContractorCity(e.target.value)} />
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
