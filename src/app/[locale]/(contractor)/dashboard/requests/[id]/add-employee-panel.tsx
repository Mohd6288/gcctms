"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEmployeeAction } from "@/modules/employees/actions";

interface JobRole {
  id: number;
  nameEn: string;
  nameAr: string;
}

export function AddEmployeePanel({
  companyId,
  jobRoles,
  locale,
  onCreated,
  onClose,
}: {
  companyId: number;
  jobRoles: JobRole[];
  locale: string;
  onCreated: (employee: { id: number; fullName: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations("contractor.requests.wizard.addEmployee");
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
      const employee = await createEmployeeAction({
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
      onCreated({ id: employee.id, fullName: fullNameEn });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("title")}</span>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-fullNameEn">{t("fullNameEnLabel")}</Label>
          <Input id="wiz-fullNameEn" required value={fullNameEn} onChange={(e) => setFullNameEn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-fullNameAr">{t("fullNameArLabel")}</Label>
          <Input id="wiz-fullNameAr" dir="rtl" required value={fullNameAr} onChange={(e) => setFullNameAr(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-nationalId">{t("nationalIdLabel")}</Label>
          <Input
            id="wiz-nationalId"
            inputMode="numeric"
            pattern="\d{10}"
            maxLength={10}
            required
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-jobRoleId">{t("jobRoleLabel")}</Label>
          <select
            id="wiz-jobRoleId"
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
          <Label htmlFor="wiz-nationality">{t("nationalityLabel")}</Label>
          <Input id="wiz-nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-activity">{t("activityLabel")}</Label>
          <Input id="wiz-activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-contractorArea">{t("contractorAreaLabel")}</Label>
          <Input id="wiz-contractorArea" value={contractorArea} onChange={(e) => setContractorArea(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-contractorCity">{t("contractorCityLabel")}</Label>
          <Input id="wiz-contractorCity" value={contractorCity} onChange={(e) => setContractorCity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-email">{t("emailLabel")}</Label>
          <Input id="wiz-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-phone">{t("phoneLabel")}</Label>
          <Input id="wiz-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={loading} className="self-start">
        {loading ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
