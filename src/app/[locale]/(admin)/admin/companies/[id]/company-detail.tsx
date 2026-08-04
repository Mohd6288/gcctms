"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { updateCompanyAction } from "@/modules/companies/actions";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;
const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface CompanyData {
  id: number;
  name: string;
  crNumber: string;
  crVerified: boolean;
  sector: string | null;
  city: string | null;
  region: string | null;
  contractorCategory: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  createdAt: Date;
}

interface RequestRow {
  id: number;
  status: string;
  courseTitleEn: string;
  courseTitleAr: string;
  createdAt: Date;
}

interface EmployeeRow {
  id: number;
  fullNameEn: string;
  fullNameAr: string;
  jobRoleNameEn: string;
  status: string;
}

export function CompanyDetail({
  company,
  requests,
  employees,
  locale,
}: {
  company: CompanyData;
  requests: RequestRow[];
  employees: EmployeeRow[];
  locale: string;
}) {
  const t = useTranslations("admin.companies.detail");
  const router = useRouter();

  const [name, setName] = useState(company.name);
  const [crNumber, setCrNumber] = useState(company.crNumber);
  const [crVerified, setCrVerified] = useState(company.crVerified);
  const [sector, setSector] = useState(company.sector ?? "");
  const [city, setCity] = useState(company.city ?? "");
  const [region, setRegion] = useState<(typeof REGIONS)[number] | "">((company.region as (typeof REGIONS)[number] | null) ?? "");
  const [contractorCategory, setContractorCategory] = useState<(typeof CONTRACTOR_CATEGORIES)[number] | "">(
    (company.contractorCategory as (typeof CONTRACTOR_CATEGORIES)[number] | null) ?? ""
  );
  const [contactName, setContactName] = useState(company.contactName);
  const [contactEmail, setContactEmail] = useState(company.contactEmail);
  const [contactPhone, setContactPhone] = useState(company.contactPhone);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      await updateCompanyAction({
        companyId: company.id,
        name,
        sector,
        city,
        contactName,
        contactEmail,
        contactPhone,
        crNumber,
        crVerified,
        region: region || undefined,
        contractorCategory: contractorCategory || undefined,
      });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title", { name: company.name })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crNumber">{t("crNumberLabel")}</Label>
            <Input id="crNumber" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label htmlFor="crVerified">{t("crVerifiedLabel")}</Label>
            <input id="crVerified" type="checkbox" checked={crVerified} onChange={(e) => setCrVerified(e.target.checked)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sector">{t("sectorLabel")}</Label>
            <Input id="sector" value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">{t("cityLabel")}</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="region">{t("regionLabel")}</Label>
            <select id="region" className={selectClassName} value={region} onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number] | "")}>
              <option value="">{t("regionNone")}</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactName">{t("contactNameLabel")}</Label>
            <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactEmail">{t("contactEmailLabel")}</Label>
            <Input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="contactPhone">{t("contactPhoneLabel")}</Label>
            <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" disabled={loading} onClick={handleSave}>
              {loading ? t("saving") : t("save")}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("requestsTitle", { count: requests.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("requestsEmpty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start font-medium">{t("tableRequest")}</th>
                  <th className="p-2 text-start font-medium">{t("tableCourse")}</th>
                  <th className="p-2 text-start font-medium">{t("tableStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="p-2">
                      <Link href={`/admin/requests/${r.id}`} className="text-primary hover:underline">
                        {r.id}
                      </Link>
                    </td>
                    <td className="p-2">{locale === "ar" ? r.courseTitleAr : r.courseTitleEn}</td>
                    <td className="p-2">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("employeesTitle", { count: employees.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("employeesEmpty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start font-medium">{t("tableName")}</th>
                  <th className="p-2 text-start font-medium">{t("tableJobRole")}</th>
                  <th className="p-2 text-start font-medium">{t("tableStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="p-2">{locale === "ar" ? e.fullNameAr : e.fullNameEn}</td>
                    <td className="p-2">{e.jobRoleNameEn}</td>
                    <td className="p-2">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
