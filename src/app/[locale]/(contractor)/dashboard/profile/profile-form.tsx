"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { updateCompanyAction } from "@/modules/companies/actions";

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
  createdAt: Date;
}

export function ProfileForm({
  company,
  requestCount,
  employeeCount,
}: {
  company: CompanyData;
  requestCount: number;
  employeeCount: number;
}) {
  const t = useTranslations("contractor.profile");
  const router = useRouter();

  const [name, setName] = useState(company.name);
  const [sector, setSector] = useState(company.sector ?? "");
  const [city, setCity] = useState(company.city ?? "");
  const [contactName, setContactName] = useState(company.contactName);
  const [contactEmail, setContactEmail] = useState(company.contactEmail);
  const [contactPhone, setContactPhone] = useState(company.contactPhone);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      await updateCompanyAction({ companyId: company.id, name, sector, city, contactName, contactEmail, contactPhone });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid w-full max-w-2xl gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crNumber">{t("crNumberLabel")}</Label>
            <Input id="crNumber" value={company.crNumber} disabled />
            <p className="text-xs text-muted-foreground">{t("crNumberHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="region">{t("regionLabel")}</Label>
            <Input id="region" value={company.region ?? t("regionNone")} disabled />
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

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("registeredOn")}</span>
            <span className="font-medium">{new Date(company.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("totalRequests")}</span>
            <span className="font-medium">{requestCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("registeredEmployees")}</span>
            <span className="font-medium">{employeeCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("crVerification")}</span>
            <span className="font-medium">{company.crVerified ? t("verified") : t("pending")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("contractorCategory")}</span>
            <span className="font-medium">{company.contractorCategory ?? t("regionNone")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
