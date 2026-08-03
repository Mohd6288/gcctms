"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { updateEmployeeAction } from "@/modules/employees/actions";

interface JobRole {
  id: number;
  nameEn: string;
  nameAr: string;
}

interface Employee {
  id: number;
  fullNameEn: string;
  fullNameAr: string;
  jobRoleId: number;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
}

export function EditEmployeeForm({ employee, jobRoles, locale }: { employee: Employee; jobRoles: JobRole[]; locale: string }) {
  const t = useTranslations("contractor.employees");
  const router = useRouter();
  const [fullNameEn, setFullNameEn] = useState(employee.fullNameEn);
  const [fullNameAr, setFullNameAr] = useState(employee.fullNameAr);
  const [jobRoleId, setJobRoleId] = useState(employee.jobRoleId);
  const [email, setEmail] = useState(employee.email ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(employee.status);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updateEmployeeAction({ employeeId: employee.id, fullNameEn, fullNameAr, jobRoleId, email, phone, status });
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
        <CardTitle>{t("editTitle")}</CardTitle>
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
            <Label htmlFor="status">{t("statusLabel")}</Label>
            <select
              id="status"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            >
              <option value="active">{t("statusActive")}</option>
              <option value="inactive">{t("statusInactive")}</option>
            </select>
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
